/**
 * Règle du domaine enfreinte. Le message s'adresse à l'utilisateur : il est en français et ne
 * contient aucune donnée personnelle, car l'API le renvoie tel quel dans le `detail` de l'erreur.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
