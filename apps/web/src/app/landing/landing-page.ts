import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ThemePreference } from '../theme/theme-preference';

/**
 * Accueil d'un visiteur sans compte.
 * Il dit le but de Trame, l'état réel de chaque partie et mène à la connexion. L'aperçu du
 * planning est une maquette annoncée comme telle : aucun résultat n'y est présenté comme calculé.
 */
@Component({
  selector: 'tr-landing-page',
  templateUrl: './landing-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  /** La session a expiré : l'accueil invite à se reconnecter pour retrouver le calcul. */
  readonly sessionExpired = input(false);
  /** Le fournisseur d'identité ne répond pas : le bouton de connexion laisse place à l'alerte. */
  readonly connectionUnavailable = input(false);
  readonly loginRequested = output();
  /** Le symbole du hero suit le thème choisi, pas seulement celui du système. */
  protected readonly theme = inject(ThemePreference).theme;

  protected requestLogin(): void {
    this.loginRequested.emit();
  }
}
