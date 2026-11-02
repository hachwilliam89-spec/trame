import {
  ShiftBreak,
  ShiftTemplate,
  Site,
  SiteCode,
  SiteCodeAlreadyUsedError,
  TimeZone,
} from '@trame/api/organization/domain';
import { PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { ORGANIZATION_A, ORGANIZATION_B } from '../../testing';
import { PrismaShiftTemplateRepository } from './prisma-shift-template.repository';
import { PrismaSiteRepository } from './prisma-site.repository';

const createdAt = Temporal.Instant.from('2026-11-02T08:00:00.123Z');
const time = (text: string): Temporal.PlainTime => Temporal.PlainTime.from(text);

let sequence = 0;
/** Identifiants croissants, comme des UUID v7 : l'ordre de création est l'ordre des identifiants. */
function nextId(): string {
  sequence += 1;
  return `0190f0a0-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

function aSite(organizationId: string, code: string): Site {
  return Site.create({
    id: nextId(),
    organizationId,
    code: SiteCode.of(code),
    name: `Site ${code}`,
    timeZone: TimeZone.of('Europe/Paris'),
    createdAt,
  });
}

function aNightShift(site: Site, label = 'Nuit'): ShiftTemplate {
  return ShiftTemplate.create({
    id: nextId(),
    organizationId: site.organizationId,
    siteId: site.id,
    label,
    start: time('22:00'),
    end: time('06:00'),
    break: ShiftBreak.of(time('02:00'), 30),
    createdAt,
  });
}

describe('dépôts Prisma du contexte organization (intégration)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let sites: PrismaSiteRepository;
  let shiftTemplates: PrismaShiftTemplateRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    sites = new PrismaSiteRepository(prisma);
    shiftTemplates = new PrismaShiftTemplateRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await database.stop();
  });

  describe('PrismaSiteRepository', () => {
    it("relit un site à l'identique, instant compris à la milliseconde", async () => {
      const site = aSite(ORGANIZATION_A, 'RELU');
      await sites.add(site);

      const reread = await sites.findById(ORGANIZATION_A, site.id);

      expect(reread?.code.value).toBe('RELU');
      expect(reread?.timeZone.id).toBe('Europe/Paris');
      expect(reread?.createdAt.equals(createdAt)).toBe(true);
    });

    it("ne trouve pas le site d'une autre organisation", async () => {
      const site = aSite(ORGANIZATION_A, 'ISOLE');
      await sites.add(site);

      await expect(sites.findById(ORGANIZATION_B, site.id)).resolves.toBeUndefined();
    });

    it("signale un code déjà pris dans l'organisation, et seulement dans celle-ci", async () => {
      await sites.add(aSite(ORGANIZATION_A, 'PRIS'));

      await expect(sites.existsWithCode(ORGANIZATION_A, SiteCode.of('PRIS'))).resolves.toBe(true);
      await expect(sites.existsWithCode(ORGANIZATION_B, SiteCode.of('PRIS'))).resolves.toBe(false);
    });

    it("traduit la contrainte d'unicité en erreur métier (création simultanée)", async () => {
      await sites.add(aSite(ORGANIZATION_A, 'DOUBLE'));

      await expect(sites.add(aSite(ORGANIZATION_A, 'DOUBLE'))).rejects.toThrow(
        SiteCodeAlreadyUsedError,
      );
    });

    it("pagine les sites de l'organisation par ordre de création", async () => {
      await sites.add(aSite(ORGANIZATION_B, 'B1'));
      await sites.add(aSite(ORGANIZATION_B, 'B2'));
      await sites.add(aSite(ORGANIZATION_B, 'B3'));

      const firstPage = await sites.list(ORGANIZATION_B, { limit: 2 });
      const secondPage = await sites.list(ORGANIZATION_B, {
        limit: 2,
        after: firstPage.nextCursor ?? undefined,
      });

      expect(firstPage.items.map((site) => site.code.value)).toEqual(['B1', 'B2']);
      expect(secondPage.items.map((site) => site.code.value)).toEqual(['B3']);
      expect(secondPage.nextCursor).toBeNull();
    });
  });

  describe('PrismaShiftTemplateRepository', () => {
    it('relit un créneau de nuit et un créneau de jour, pauses comprises', async () => {
      const site = aSite(ORGANIZATION_A, 'CRENEAUX');
      await sites.add(site);
      const night = aNightShift(site);
      const morning = ShiftTemplate.create({
        ...night,
        id: nextId(),
        label: 'Matin',
        start: time('06:00'),
        end: time('14:00'),
        break: ShiftBreak.of(time('10:00'), 20),
      });
      await shiftTemplates.add(night);
      await shiftTemplates.add(morning);

      const rereadNight = await shiftTemplates.findById(ORGANIZATION_A, site.id, night.id);
      const rereadMorning = await shiftTemplates.findById(ORGANIZATION_A, site.id, morning.id);

      expect(rereadNight?.start.toString()).toBe('22:00:00');
      expect(rereadNight?.end.toString()).toBe('06:00:00');
      expect(rereadNight?.break.start.toString()).toBe('02:00:00');
      expect(rereadNight?.break.durationMinutes).toBe(30);
      expect(rereadNight?.crossesMidnight).toBe(true);
      expect(rereadMorning?.break.start.toString()).toBe('10:00:00');
      expect(rereadMorning?.crossesMidnight).toBe(false);
    });

    it('ne trouve pas un créneau par un autre site ou une autre organisation', async () => {
      const site = aSite(ORGANIZATION_A, 'SITE-1');
      const otherSite = aSite(ORGANIZATION_A, 'SITE-2');
      await sites.add(site);
      await sites.add(otherSite);
      const night = aNightShift(site);
      await shiftTemplates.add(night);

      await expect(
        shiftTemplates.findById(ORGANIZATION_A, otherSite.id, night.id),
      ).resolves.toBeUndefined();
      await expect(
        shiftTemplates.findById(ORGANIZATION_B, site.id, night.id),
      ).resolves.toBeUndefined();
    });

    it("la base refuse un créneau rattaché au site d'une autre organisation (clé étrangère composite)", async () => {
      const siteOfA = aSite(ORGANIZATION_A, 'FK-A');
      await sites.add(siteOfA);
      const intruder = ShiftTemplate.create({
        ...aNightShift(siteOfA),
        organizationId: ORGANIZATION_B,
      });

      // P2003 : violation de clé étrangère.
      await expect(shiftTemplates.add(intruder)).rejects.toMatchObject({ code: 'P2003' });
    });

    it('liste les créneaux du site seulement', async () => {
      const site = aSite(ORGANIZATION_A, 'LISTE');
      const otherSite = aSite(ORGANIZATION_A, 'AUTRE');
      await sites.add(site);
      await sites.add(otherSite);
      await shiftTemplates.add(aNightShift(site, 'Nuit'));
      await shiftTemplates.add(aNightShift(site, 'Nuit longue'));
      await shiftTemplates.add(aNightShift(otherSite, 'Nuit'));

      const page = await shiftTemplates.listBySite(ORGANIZATION_A, site.id, { limit: 50 });

      expect(page.items.map((shiftTemplate) => shiftTemplate.label)).toEqual([
        'Nuit',
        'Nuit longue',
      ]);
    });

    it.each([
      ['une pause de durée nulle', { breakStartMinute: 30, breakDurationMinutes: 0 }],
      ['une pause hors de la journée', { breakStartMinute: 1440, breakDurationMinutes: 15 }],
      [
        'une fin hors de la journée',
        { endMinute: 1500, breakStartMinute: 30, breakDurationMinutes: 15 },
      ],
    ])('la base refuse %s (contraintes CHECK)', async (_case, invalidColumns) => {
      const site = aSite(ORGANIZATION_A, `CHECK-${nextId().slice(-4).toUpperCase()}`);
      await sites.add(site);

      const insert = prisma.shiftTemplate.create({
        data: {
          id: nextId(),
          organizationId: ORGANIZATION_A,
          siteId: site.id,
          label: 'Incohérent',
          startMinute: 0,
          endMinute: 60,
          breakStartMinute: 30,
          breakDurationMinutes: 15,
          createdAt: new Date(createdAt.epochMilliseconds),
          ...invalidColumns,
        },
      });

      await expect(insert).rejects.toThrow();
    });
  });
});
