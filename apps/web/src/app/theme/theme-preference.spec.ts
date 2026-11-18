import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemePreference } from './theme-preference';

/** Un réglage système contrôlable, à la place de `matchMedia`. */
function systemPreference(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  };
  return {
    query,
    switchTo(nextDark: boolean) {
      query.matches = nextDark;
      for (const listener of listeners) listener({ matches: nextDark } as MediaQueryListEvent);
    },
  };
}

describe('Préférence de thème', () => {
  const root = document.documentElement;
  let system: ReturnType<typeof systemPreference>;

  beforeEach(() => {
    localStorage.clear();
    root.removeAttribute('data-theme');
    root.removeAttribute('data-theme-choice');
    system = systemPreference(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => system.query),
    );
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function create(): ThemePreference {
    const preference = TestBed.inject(ThemePreference);
    TestBed.tick();
    return preference;
  }

  it('suit le système par défaut et pose le thème sur <html>', () => {
    const preference = create();
    expect(preference.choice()).toBe('system');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.getAttribute('data-theme-choice')).toBe('system');
  });

  it('suit un changement du système sans rechargement tant que « Système » est choisi', () => {
    const preference = create();
    system.switchTo(true);
    TestBed.tick();
    expect(preference.theme()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('applique et conserve un choix explicite, qui ignore ensuite le système', () => {
    const preference = create();
    preference.choose('dark');
    TestBed.tick();
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    system.switchTo(false);
    TestBed.tick();
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('retrouve le choix conservé au chargement', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    system.switchTo(true);
    const preference = create();
    expect(preference.choice()).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('revient au système et efface le choix conservé', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const preference = create();
    preference.choose('system');
    TestBed.tick();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('ignore une valeur conservée inconnue', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'violet');
    expect(create().choice()).toBe('system');
  });
});
