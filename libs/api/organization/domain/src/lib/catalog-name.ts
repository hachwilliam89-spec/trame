/** Longueur maximale du nom d'une compétence ou d'un poste, comme pour un site. */
const CATALOG_NAME_MAX_LENGTH = 100;

/** Un nom du catalogue a au moins un caractère visible, et 100 caractères au plus. */
export function isValidCatalogName(name: string): boolean {
  return name.trim() !== '' && name.length <= CATALOG_NAME_MAX_LENGTH;
}
