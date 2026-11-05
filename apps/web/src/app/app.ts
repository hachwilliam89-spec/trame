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
import { DiagnosticState } from '@trame/web/scheduling/data-access';
import { DiagnosticPage } from '@trame/web/scheduling/feature-diagnostic';
@Component({
  selector: 'tr-root',
  imports: [DiagnosticPage],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly session = inject(WebSession);
  private readonly diagnostic = inject(DiagnosticState);
  protected readonly actionError = signal('');
  protected readonly roleLabel = computed(() => {
    const roles = this.session.identity()?.roles ?? [];
    if (roles.includes('admin')) return 'Administrateur';
    if (roles.includes('manager')) return 'Manager';
    return 'Employé';
  });
  constructor() {
    effect(() => {
      void this.diagnostic.identify(this.session.identity());
    });
    effect(() => {
      if (this.diagnostic.phase() === 'expired') this.session.expire();
    });
    inject(DestroyRef).onDestroy(() => this.diagnostic.disconnect());
  }
  protected async login(): Promise<void> {
    this.actionError.set('');
    try {
      await this.session.login();
    } catch {
      this.actionError.set('La connexion est momentanément indisponible. Réessayez.');
    }
  }
  protected async logout(): Promise<void> {
    this.diagnostic.disconnect();
    this.actionError.set('');
    try {
      await this.session.logout();
    } catch {
      this.actionError.set('La déconnexion n’a pas pu aboutir. Réessayez.');
    }
  }
}
