# `@trame/platform/pagination`

Pagination par curseur (ADR-0021), sans dépendance.

- `PageRequest` : `limit`, et `after`, l'identifiant du dernier élément de la page précédente.
- `Page<T>` : `items` et `nextCursor` (`null` sur la dernière page).
- `pageFrom(rows, limit)` : construit une page à partir de `limit + 1` éléments lus. L'élément en trop signale une page suivante, sans requête de comptage.
- `pageOf(items, request)` : la même chose sur des éléments en mémoire, pour les dépôts de test. Ils sont triés caractère par caractère, comme PostgreSQL trie des `uuid`.

Les éléments sont triés par identifiant croissant. Avec les UUID v7 de `@trame/platform/ids`, c'est l'ordre de création au sein d'une instance de l'API.

```ts
const rows = await prisma.site.findMany({
  where: { organizationId, ...(page.after === undefined ? {} : { id: { gt: page.after } }) },
  orderBy: { id: 'asc' },
  take: page.limit + 1,
});
return pageFrom(rows.map(toSite), page.limit);
```
