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
        },
      });
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain(status);
      expect(element.querySelectorAll('tbody tr').length).toBe(
        ['OPTIMAL', 'FEASIBLE'].includes(status) ? 3 : 0,
      );
    },
  );
});
