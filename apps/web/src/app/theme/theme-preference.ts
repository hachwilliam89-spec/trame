import { computed, DestroyRef, DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';

/** Ce que l'utilisateur a choisi. « Système » suit le réglage du système d'exploitation. */
export type ThemeChoice = 'light' | 'dark' | 'system';
/** Le thème réellement affiché. */
export type Theme = 'light' | 'dark';

/** Clé partagée avec `public/theme-init.js`, qui applique le choix avant le premier rendu. */
export const THEME_STORAGE_KEY = 'trame.theme';

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** `localStorage`, ou un stockage vide quand le navigateur le refuse. */
function themeStorage(window: Window | null): ThemeStorage | undefined {
  try {
    return window?.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

function savedChoice(storage: ThemeStorage | undefined): ThemeChoice {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Préférence de thème de l'interface : Clair, Sombre ou Système (par défaut).
 * Le choix est conservé dans `localStorage` et appliqué aussitôt sur <html> par l'attribut
 * `data-theme`, que les jetons CSS (`light-dark()`) et les logos suivent sans rechargement.
 */
@Injectable({ providedIn: 'root' })
export class ThemePreference {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly storage = themeStorage(this.window);
  private readonly systemQuery =
    typeof this.window?.matchMedia === 'function'
      ? this.window.matchMedia('(prefers-color-scheme: dark)')
      : undefined;
  private readonly systemDark = signal(this.systemQuery?.matches ?? false);

  readonly choice = signal<ThemeChoice>(savedChoice(this.storage));
  readonly theme = computed<Theme>(() => {
    const choice = this.choice();
    if (choice !== 'system') return choice;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    const followSystem = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
    this.systemQuery?.addEventListener('change', followSystem);
    inject(DestroyRef).onDestroy(() =>
      this.systemQuery?.removeEventListener('change', followSystem),
    );
    effect(() => {
      const root = this.document.documentElement;
      root.setAttribute('data-theme', this.theme());
      root.setAttribute('data-theme-choice', this.choice());
    });
  }

  choose(choice: ThemeChoice): void {
    this.choice.set(choice);
    try {
      if (choice === 'system') this.storage?.removeItem(THEME_STORAGE_KEY);
      else this.storage?.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      // Le choix reste valable pour la session en cours.
    }
  }
}
