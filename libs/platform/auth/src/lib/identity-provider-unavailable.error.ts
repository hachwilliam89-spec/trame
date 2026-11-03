/**
 * Levée par un `ActorResolver` quand il ne peut pas vérifier un jeton faute de joindre le
 * fournisseur d'identité (clés publiques injoignables, réponse invalide). `AuthGuard` répond 503 :
 * ce n'est pas un refus du jeton, et l'accès n'est jamais accordé dans le doute.
 */
export class IdentityProviderUnavailableError extends Error {
  constructor() {
    super("Fournisseur d'identité injoignable");
    this.name = 'IdentityProviderUnavailableError';
  }
}
