import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { WebSession } from '@trame/web/auth/data-access';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  canManagePlanning,
  DiagnosticState,
  PlanningState,
  rememberPlanningReturn,
} from '@trame/web/scheduling/data-access';
import { browserStorage } from './browser-storage';
import { LandingPage } from './landing/landing-page';
import { ThemePreference } from './theme/theme-preference';
import { ThemeSwitch } from './theme/theme-switch';
@Component({
  selector: 'tr-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LandingPage, ThemeSwitch],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly session = inject(WebSession);
  protected readonly theme = inject(ThemePreference).theme;
  private readonly diagnostic = inject(DiagnosticState);
  private readonly planning = inject(PlanningState);
  protected readonly actionError = signal('');
  protected readonly canOpenPlanning = computed(() => canManagePlanning(this.session.identity()));
  protected readonly roleLabel = computed(() => {
    const roles = this.session.identity()?.roles ?? [];
    if (roles.includes('admin')) return 'Administrateur';
    if (roles.includes('manager')) return 'Manager';
    return 'Employé';
  });
  constructor() {
    effect(() => {
      const identity = this.session.identity();
      void this.diagnostic.identify(identity);
      void this.planning.identify(identity);
    });
    effect(() => {
      if (this.planning.phase() === 'expired') this.session.expire();
    });
    effect(() => {
      if (this.diagnostic.phase() === 'expired') this.session.expire();
    });
    inject(DestroyRef).onDestroy(() => {
      this.diagnostic.disconnect();
      this.planning.disconnect();
    });
  }
  protected async login(): Promise<void> {
    this.actionError.set('');
    rememberPlanningReturn(browserStorage(), location.pathname, location.search);
    try {
      await this.session.login();
    } catch {
      this.actionError.set('La connexion est momentanément indisponible. Réessayez.');
    }
  }
  protected async logout(): Promise<void> {
    this.diagnostic.disconnect();
    this.planning.disconnect();
    this.actionError.set('');
    try {
      await this.session.logout();
    } catch {
      this.actionError.set('La déconnexion n’a pas pu aboutir. Réessayez.');
    }
  }
}
