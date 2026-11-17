import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import type { ScheduleGenerationV1 } from '@trame/shared/contracts/scheduling';
import { PlanningState, type PlanningCatalog } from '@trame/web/scheduling/data-access';
import type { Type } from '@angular/core';

const SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const MORNING = '0190f0a0-0000-7000-8000-000000000011';
const AFTERNOON = '0190f0a0-0000-7000-8000-000000000012';
const FORKLIFT = '0190f0a0-0000-7000-8000-000000000021';
const PICKING = '0190f0a0-0000-7000-8000-000000000022';
const RECEIVING = '0190f0a0-0000-7000-8000-000000000023';
const CAMILLE = '0190f0a0-0000-7000-8000-000000000041';
const NADIA = '0190f0a0-0000-7000-8000-000000000043';
const CREATED_AT = '2026-11-17T08:00:00.000Z';

function shift(date: string, template: string, position: string, requiredCount: number) {
  const morning = template === MORNING;
  return {
    id: `${date}/${template}/${position}`,
    date,
    shiftTemplateId: template,
    positionId: position,
    startsAt: `${date}T${morning ? '06:00' : '13:30'}:00+01:00`,
    endsAt: `${date}T${morning ? '13:20' : '20:50'}:00+01:00`,
    effectiveMinutes: 420,
    requiredSkillIds: [],
    requiredCount,
  };
}

const shifts = [
  shift('2026-11-23', MORNING, RECEIVING, 1),
  shift('2026-11-24', AFTERNOON, PICKING, 1),
  shift('2026-11-28', MORNING, FORKLIFT, 3),
];

function generation(
  id: string,
  result: 'OPTIMAL' | 'INFEASIBLE',
  problemShifts = shifts,
): ScheduleGenerationV1 {
  const schedule = {
    assignments: [
      { shiftId: problemShifts[0]?.id, employeeId: NADIA },
      { shiftId: problemShifts[1]?.id, employeeId: NADIA },
      { shiftId: problemShifts[2]?.id, employeeId: CAMILLE },
    ],
    shortfalls: [{ shiftId: problemShifts[2]?.id, requiredCount: 3, assignedCount: 1 }],
  };
  return {
    id,
    siteId: SITE,
    weekStartsOn: '2026-11-23',
    status: 'SUCCEEDED',
    problem: {
      weekStartsOn: '2026-11-23',
      timeZone: 'Europe/Paris',
      shifts: problemShifts,
      employees: [
        {
          id: CAMILLE,
          qualifications: [],
          contract: { weeklyMinutesMin: 1680, weeklyMinutesMax: 2100 },
        },
        {
          id: NADIA,
          qualifications: [],
          contract: { weeklyMinutesMin: 840, weeklyMinutesMax: 1260 },
        },
      ],
      rules: [{ id: 'REPOS_QUOTIDIEN_MIN', minimumMinutes: 660 }],
      objective: { mode: 'STANDARD' },
    },
    excludedEmployees: [],
    outcome: {
      result:
        result === 'OPTIMAL' ? { status: result, schedule } : { status: result, schedule: null },
      checkedRules: ['REPOS_QUOTIDIEN_MIN'],
      solveSeconds: 0.2,
    },
  } as unknown as ScheduleGenerationV1;
}

const catalog = {
  site: {
    id: SITE,
    code: 'DEMO',
    name: 'Entrepôt de démonstration',
    timeZone: 'Europe/Paris',
    createdAt: CREATED_AT,
  },
  positions: [
    { id: FORKLIFT, name: 'Cariste' },
    { id: PICKING, name: 'Préparateur de commandes' },
    { id: RECEIVING, name: 'Réceptionnaire' },
  ],
  shiftTemplates: [
    { id: MORNING, label: 'Matin' },
    { id: AFTERNOON, label: 'Après-midi' },
  ],
  employees: [
    { id: CAMILLE, firstName: 'Camille', lastName: 'Laurent' },
    { id: NADIA, firstName: 'Nadia', lastName: 'Guérin' },
  ],
} as unknown as PlanningCatalog;

describe('Page Planning', () => {
  let planning: {
    phase: ReturnType<typeof signal<string>>;
    catalog: ReturnType<typeof signal<PlanningCatalog | undefined>>;
    latestAttempt: ReturnType<typeof signal<ScheduleGenerationV1 | null>>;
    latestSchedule: ReturnType<typeof signal<ScheduleGenerationV1 | null>>;
    request: ReturnType<typeof signal<string>>;
    open: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let PlanningPage: Type<unknown>;

  beforeEach(async () => {
    // La page est chargée à la demande, comme par la route `planning`.
    ({ PlanningPage } = await import('@trame/web/scheduling/feature-planning'));
    const shown = generation('A', 'OPTIMAL');
    planning = {
      phase: signal('ready'),
      catalog: signal<PlanningCatalog | undefined>(catalog),
      latestAttempt: signal<ScheduleGenerationV1 | null>(shown),
      latestSchedule: signal<ScheduleGenerationV1 | null>(shown),
      request: signal('idle'),
      open: vi.fn(async () => undefined),
      generate: vi.fn(async () => undefined),
      resume: vi.fn(async () => undefined),
    };
    query = new BehaviorSubject(convertToParamMap({ site: SITE, semaine: '2026-11-23' }));
    await TestBed.configureTestingModule({
      imports: [PlanningPage],
      providers: [
        provideRouter([]),
        { provide: PlanningState, useValue: planning },
        { provide: ActivatedRoute, useValue: { queryParamMap: query } },
      ],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(PlanningPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function text(element: Element | null | undefined): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function rowOf(page: HTMLElement, name: string): HTMLTableRowElement | undefined {
    return Array.from(page.querySelectorAll<HTMLTableRowElement>('.week-grid tbody tr')).find(
      (row) => text(row.querySelector('th')).startsWith(name),
    );
  }

  it('ouvre la semaine de l’adresse et titre la page avec le site, le numéro et les dates', async () => {
    const page = await render();

    expect(planning.open).toHaveBeenCalledWith(SITE, '2026-11-23');
    expect(text(page.querySelector('h1'))).toBe('23–29 novembre 2026');
    expect(text(page.querySelector('.week-label'))).toBe(
      'Entrepôt de démonstration · Planning de la semaine 48',
    );
    expect(text(page.querySelector('.week-status'))).toContain(
      'Aucun besoin planifié : mercredi, jeudi, vendredi, dimanche',
    );
  });

  it('Grille de la semaine : une ligne par salarié, ses créneaux, le poste tenu et ses heures face au contrat', async () => {
    const page = await render();

    const nadia = rowOf(page, 'Nadia Guérin');
    expect(text(nadia?.querySelector('th small'))).toBe(
      'Préparateur de commandes · Réceptionnaire',
    );
    const nadiaShifts = Array.from(nadia?.querySelectorAll('button.shift') ?? []).map(text);
    expect(nadiaShifts).toEqual(['Matin Réceptionnaire', 'Après-midi Préparateur de commandes']);
    expect(text(nadia?.querySelector('.weekly-hours strong'))).toBe('14 h');
    expect(text(nadia?.querySelector('.weekly-hours .meta'))).toBe('Contrat 14–21 h');
    const camille = rowOf(page, 'Camille Laurent');
    expect(Array.from(camille?.querySelectorAll('button.shift') ?? []).map(text)).toEqual([
      'Matin',
    ]);
    expect(text(page.querySelector('.legend'))).toBe(
      'Matin 06 h–13 h 20 Après-midi 13 h 30–20 h 50',
    );
  });

  it('affiche et distingue deux affectations du même salarié sur une journée', async () => {
    const monday = '2026-11-23';
    const morning = {
      ...shift(monday, MORNING, RECEIVING, 1),
      endsAt: `${monday}T08:00:00+01:00`,
      effectiveMinutes: 100,
    };
    const evening = {
      ...shift(monday, AFTERNOON, PICKING, 1),
      startsAt: `${monday}T19:00:00+01:00`,
      endsAt: `${monday}T21:00:00+01:00`,
      effectiveMinutes: 100,
    };
    const saturday = shift('2026-11-28', MORNING, FORKLIFT, 3);
    planning.latestSchedule.set(generation('A', 'OPTIMAL', [morning, evening, saturday]));

    const fixture = TestBed.createComponent(PlanningPage);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const row = rowOf(page, 'Nadia Guérin');
    assert.isDefined(row);
    const mondayCell = row.cells.item(1);
    assert.isNotNull(mondayCell);
    const buttons = Array.from(mondayCell.querySelectorAll<HTMLButtonElement>('button.shift'));
    expect(buttons.map(text)).toEqual([
      'Matin Réceptionnaire',
      'Après-midi Préparateur de commandes',
    ]);
    expect(text(row.querySelector('.weekly-hours strong'))).toBe('3 h 20');

    buttons[1]?.click();
    await fixture.whenStable();
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(text(page.querySelector('.assignment-detail'))).toContain('19 h–21 h');

    const selection = page.querySelector<HTMLSelectElement>('.day-control select');
    assert.isNotNull(selection);
    selection.value = monday;
    selection.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(rowOf(page, 'Nadia Guérin')?.querySelectorAll('button.shift')).toHaveLength(2);

    row.querySelector<HTMLButtonElement>('.employee-link')?.click();
    await fixture.whenStable();
    const employeeDay = page.querySelector('.employee-week tbody tr');
    const assignments = Array.from(employeeDay?.querySelectorAll('.employee-assignment') ?? []);
    expect(assignments.map((entry) => Array.from(entry.children).map(text))).toEqual([
      ['Matin · Réceptionnaire', '06 h–08 h'],
      ['Après-midi · Préparateur de commandes', '19 h–21 h'],
    ]);
  });

  it('Couverture par créneau : le manque du samedi matin est mis en évidence', async () => {
    const page = await render();

    expect(text(page.querySelector('.coverage .meta'))).toMatch(
      /^3 places pourvues sur 5 · 60\s?%$/,
    );
    const gaps = Array.from(page.querySelectorAll('.gaps summary')).map((summary) => [
      text(summary.querySelector('strong')),
      text(summary.querySelector('.gap-count')),
    ]);
    expect(gaps).toEqual([['Samedi 28 · Matin · Cariste', '1 affecté sur 3 · 2 manquants']]);
    const understaffed = page.querySelector('.coverage-table tr.understaffed');
    expect(Array.from(understaffed?.querySelectorAll('td') ?? []).map(text)).toEqual([
      'Matin',
      'Cariste',
      '1 / 3 · Manque',
    ]);
  });

  it('Règles vérifiées : chaque règle avec sa valeur et sa référence légale', async () => {
    const page = await render();

    const rules = Array.from(page.querySelectorAll('#planning-rules li')).map(text);
    expect(rules).toEqual([
      'Repos quotidien d’au moins 11 h consécutives · C. trav., art. L3131-1',
    ]);
  });

  it('garde le planning précédent quand le dernier essai ne trouve aucun planning légal', async () => {
    planning.latestAttempt.set(generation('B', 'INFEASIBLE'));

    const page = await render();

    expect(text(page.querySelector('[role="status"]'))).toContain(
      'Aucun planning ne respecte les règles pour cette semaine. Le planning affiché reste celui du calcul précédent.',
    );
    expect(page.querySelectorAll('.week-grid tbody tr').length).toBe(2);
  });

  it('Aucun planning légal : sans calcul précédent, l’écran ne propose aucune grille', async () => {
    planning.latestAttempt.set(generation('B', 'INFEASIBLE'));
    planning.latestSchedule.set(null);

    const page = await render();

    expect(text(page.querySelector('[role="status"]'))).toContain(
      'Aucun planning ne respecte les règles',
    );
    expect(page.querySelector('.week-grid')).toBeNull();
    expect(page.querySelector('.coverage')).toBeNull();
  });

  it('génère le planning d’une semaine sans calcul, puis reprend un suivi coupé', async () => {
    planning.latestAttempt.set(null);
    planning.latestSchedule.set(null);
    const fixture = TestBed.createComponent(PlanningPage);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const action = () => page.querySelector<HTMLButtonElement>('.attempt button');

    expect(text(action())).toBe('Générer le planning');
    action()?.click();
    expect(planning.generate).toHaveBeenCalledOnce();

    planning.latestAttempt.set({ ...generation('A', 'OPTIMAL'), status: 'RUNNING' });
    planning.request.set('interrupted');
    await fixture.whenStable();
    expect(text(action())).toBe('Reprendre le suivi');
    action()?.click();
    expect(planning.resume).toHaveBeenCalledOnce();
    expect(planning.generate).toHaveBeenCalledOnce();
  });

  it('refuse une adresse sans site ni semaine valides, sans rien charger', async () => {
    query.next(convertToParamMap({ site: SITE, semaine: '2026-11-24' }));

    const page = await render();

    expect(text(page.querySelector('h1'))).toBe('Adresse du planning incomplète');
    expect(planning.open).not.toHaveBeenCalled();
  });

  it('passe en vue Jour depuis un manque, puis ouvre la semaine d’un salarié et la referme au clavier', async () => {
    const fixture = TestBed.createComponent(PlanningPage);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    page.querySelector<HTMLButtonElement>('.gap-detail button')?.click();
    await fixture.whenStable();
    const columns = Array.from(page.querySelectorAll('.week-grid thead th')).map(text);
    expect(columns).toEqual(['Salarié', 'SamediSam. 28', 'Heures semaine']);

    const trigger = page.querySelector<HTMLButtonElement>('.employee-link');
    trigger?.click();
    await fixture.whenStable();
    const profile = page.querySelector('.employee-profile');
    expect(text(profile?.querySelector('h3'))).toBe('Camille Laurent');
    const days = Array.from(profile?.querySelectorAll('tbody tr') ?? []).map((row) => [
      text(row.querySelector('th')),
      ...Array.from(row.querySelectorAll('td span')).map(text),
    ]);
    expect(days).toContainEqual(['Samedi 28', 'Matin · Cariste', '06 h–13 h 20']);
    expect(days).toContainEqual(['Dimanche 29', 'Aucun besoin planifié']);
    expect(document.activeElement?.textContent?.trim()).toBe('Fermer');

    profile?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(page.querySelector('.employee-profile')).toBeNull();
  });
});
