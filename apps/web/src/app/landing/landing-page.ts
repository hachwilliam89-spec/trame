import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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

  protected requestLogin(): void {
    this.loginRequested.emit();
  }
}
