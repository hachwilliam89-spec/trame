import { Site } from './site';
import { SiteCode } from './site-code';
import { BlankSiteNameError, InvalidSiteCodeError, UnknownTimeZoneError } from './site.errors';
import { TimeZone } from './time-zone';

const createdAt = Temporal.Instant.from('2026-11-02T08:00:00Z');

describe('SiteCode', () => {
  it.each(['COL', 'A', 'LYS-2', 'ENTREPOT-NORD-2026'])('accepte %j', (code) => {
    expect(SiteCode.of(code).value).toBe(code);
  });

  it.each(['', 'col', '-COL', 'COL MAR', 'ENTREPOT-NORD-COLMAR-2'])('refuse %j', (code) => {
    expect(() => SiteCode.of(code)).toThrow(InvalidSiteCodeError);
  });

  it('compare deux codes par leur valeur', () => {
    expect(SiteCode.of('COL').equals(SiteCode.of('COL'))).toBe(true);
    expect(SiteCode.of('COL').equals(SiteCode.of('LYS'))).toBe(false);
  });
});

describe('TimeZone', () => {
  it('accepte un fuseau IANA', () => {
    expect(TimeZone.of('Europe/Paris').id).toBe('Europe/Paris');
  });

  it('normalise la casse', () => {
    expect(TimeZone.of('europe/paris').id).toBe('Europe/Paris');
  });

  it.each(['Europe/Colmar', '', 'Paris'])('refuse le fuseau inconnu %j', (name) => {
    expect(() => TimeZone.of(name)).toThrow(UnknownTimeZoneError);
  });

  it('refuse un décalage fixe, qui ignore les changements d’heure', () => {
    expect(() => TimeZone.of('+02:00')).toThrow(UnknownTimeZoneError);
  });

  it('nomme le fuseau refusé dans le message', () => {
    expect(() => TimeZone.of('Europe/Colmar')).toThrow('« Europe/Colmar »');
  });
});

describe('Site', () => {
  const properties = {
    id: '00000000-0000-7000-8000-000000000001',
    organizationId: 'org-a',
    code: SiteCode.of('COL'),
    name: 'Entrepôt de Colmar',
    timeZone: TimeZone.of('Europe/Paris'),
    createdAt,
  };

  it('se crée avec un nom', () => {
    const site = Site.create(properties);

    expect(site.code.value).toBe('COL');
    expect(site.timeZone.id).toBe('Europe/Paris');
  });

  it('refuse un nom vide ou blanc', () => {
    expect(() => Site.create({ ...properties, name: '   ' })).toThrow(BlankSiteNameError);
  });

  it('se reconstitue sans revérifier ses règles', () => {
    expect(Site.restore({ ...properties, name: '' }).name).toBe('');
  });
});
