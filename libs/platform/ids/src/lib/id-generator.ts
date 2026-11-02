/** Port de génération d'identifiants : le code applicatif ne crée jamais d'identifiant lui-même. */
export interface IdGenerator {
  next(): string;
}
