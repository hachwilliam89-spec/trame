import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { WebSession } from '@trame/web/auth/data-access';
import { DiagnosticState } from '@trame/web/scheduling/data-access';
import { App } from './app';

describe('Premier parcours Guidé', () => {
  const identity = { subject: 'manager-A', organizationId: 'organization-A', roles: ['manager'] };
  let session: {
    identity: ReturnType<typeof signal<typeof identity | undefined>>;
    status: ReturnType<typeof signal<string>>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  };
  let diagnostic: {
    phase: ReturnType<typeof signal<string>>;
    run: ReturnType<typeof signal<unknown>>;
    historyExpired: ReturnType<typeof signal<boolean>>;
    identify: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };
  beforeEach(async () => {
    session = {
      identity: signal<typeof identity | undefined>(undefined),
      status: signal('anonymous'),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      expire: vi.fn(),
    };
    diagnostic = {
      phase: signal('ready'),
      run: signal(undefined),
      historyExpired: signal(false),
      identify: vi.fn(async () => undefined),
      disconnect: vi.fn(),
      start: vi.fn(async () => undefined),
      resume: vi.fn(async () => undefined),
    };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: WebSession, useValue: session },
        { provide: DiagnosticState, useValue: diagnostic },
      ],
    }).compileComponents();
  });
  it('affiche le logo et déclenche la connexion par redirection sans formulaire de mot de passe', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('img')?.alt).toBe('Trame');
    expect(element.querySelector('input[type=password]')).toBeNull();
    (element.querySelector('button') as HTMLButtonElement).click();
    expect(session.login).toHaveBeenCalledOnce();
  });
  it('guide le visiteur vers la connexion sans simuler un résultat', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const link = element.querySelector<HTMLAnchorElement>('a[href="#diagnostic-start"]');
    expect(link?.textContent).toContain('Voir le premier diagnostic');
    expect(element.querySelector('#diagnostic-start')?.textContent).toContain('Se connecter');
    expect(element.textContent).toContain('Diagnostic réel sur compte');
    expect(element.querySelector('tbody')).toBeNull();
    expect(diagnostic.start).not.toHaveBeenCalled();
  });
  it('propose le test au manager et déclenche le vrai état sans animation simulée', async () => {
    session.identity.set(identity);
    session.status.set('authenticated');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toBe('Tester le moteur');
    const launch = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Tester le moteur'),
    );
    launch?.click();
    expect(diagnostic.start).toHaveBeenCalledOnce();
  });
  it.each(['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'CANCELLED'])(
    'présente honnêtement l’issue %s sans inventer de solution',
    async (status) => {
      session.identity.set(identity);
      session.status.set('authenticated');
      diagnostic.phase.set('result');
      diagnostic.run.set({
        id: 'diagnostic-A',
        status: 'SUCCEEDED',
        outcome: {
          result: {
            status,
            solution: ['OPTIMAL', 'FEASIBLE'].includes(status)
              ? { cost: 5, assignment: [1, 0, 2] }
              : null,
          },
          problem: {
            name: 'assignment-smoke-v1',
            costs: [
              [4, 1, 3],
              [2, 0, 5],
              [3, 2, 2],
            ],
          },
          parameters: { workers: 1, seed: 0, timeLimitSeconds: 5 },
        },
      });
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain(status);
      expect(element.querySelectorAll('table.assignments tbody tr').length).toBe(
        ['OPTIMAL', 'FEASIBLE'].includes(status) ? 3 : 0,
      );
      expect(element.querySelectorAll('tr-assignment-weave path.thread').length).toBe(
        ['OPTIMAL', 'FEASIBLE'].includes(status) ? 3 : 0,
      );
    },
  );

  describe('page du diagnostic aux couleurs du tissage', () => {
    const optimalRun = {
      id: 'diagnostic-A',
      status: 'SUCCEEDED',
      createdAt: '2026-11-15T18:00:02.000Z',
      finishedAt: '2026-11-15T18:00:03.400Z',
      outcome: {
        result: { status: 'OPTIMAL', solution: { cost: 5, assignment: [1, 0, 2] } },
        problem: {
          name: 'assignment-smoke-v1',
          costs: [
            [4, 1, 3],
            [2, 0, 5],
            [3, 2, 2],
          ],
        },
        parameters: { workers: 1, seed: 0, timeLimitSeconds: 5 },
      },
    };

    async function renderAsManager(run: unknown, phase = 'result'): Promise<HTMLElement> {
      session.identity.set(identity);
      session.status.set('authenticated');
      diagnostic.phase.set(phase);
      diagnostic.run.set(run);
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    }

    it('montre le logo dans le bandeau, sans le répéter aux lecteurs d’écran', async () => {
      const element = await renderAsManager(undefined, 'ready');

      const mark = element.querySelector<HTMLImageElement>('.diagnostic-band img.band-mark');
      expect(mark?.getAttribute('src')).toBe('/trame-mark.svg');
      expect(mark?.alt).toBe('');
      expect(element.querySelector('.diagnostic-band h1')?.textContent).toBe('Tester le moteur');
    });

    it('relie chaque tâche à son poste par un fil, décrit pour les lecteurs d’écran', async () => {
      const element = await renderAsManager(optimalRun);

      const weave = element.querySelector('tr-assignment-weave svg');
      expect(weave?.querySelectorAll('path.thread').length).toBe(3);
      expect(weave?.getAttribute('role')).toBe('img');
      expect(weave?.getAttribute('aria-label')).toBe(
        'La tâche A est reliée au poste 2, la tâche B au poste 1, la tâche C au poste 3.',
      );
    });

    it('affiche l’issue, la durée réelle du calcul et son coût', async () => {
      const element = await renderAsManager(optimalRun);

      const facts = element.querySelector('.facts')?.textContent ?? '';
      expect(facts).toContain('Optimale');
      expect(facts).toContain('1,4 s');
      expect(element.querySelector('.fact-cost dd')?.textContent?.trim()).toBe('5');
    });

    it('n’invente pas de durée quand la fin du calcul n’est pas connue', async () => {
      const element = await renderAsManager({ ...optimalRun, finishedAt: undefined });

      expect(element.querySelector('.fact-duration')).toBeNull();
    });

    it('détaille les coûts du problème et marque les trois cases retenues', async () => {
      const element = await renderAsManager(optimalRun);

      const chosen = Array.from(element.querySelectorAll('table.costs td.chosen'));
      expect(chosen.map((cell) => cell.textContent?.trim())).toEqual([
        '1 (retenu)',
        '2 (retenu)',
        '2 (retenu)',
      ]);
      expect(element.querySelectorAll('table.costs tbody td').length).toBe(9);
    });

    it('annonce la suite sans la présenter comme disponible', async () => {
      const element = await renderAsManager(undefined, 'ready');

      const nextStep = element.querySelector('.next-step')?.textContent ?? '';
      expect(nextStep).toContain('En construction');
      expect(nextStep).toContain('planning d’une semaine');
      expect(element.querySelector('.next-step a, .next-step button')).toBeNull();
    });
  });
});
