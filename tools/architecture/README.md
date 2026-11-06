# Tests d'architecture

Ces tests prouvent que la lint applique les règles d'architecture 1, 2, 4 et 11 d'AGENTS.md. Pour chaque cas, un import fictif est placé dans un fichier d'un projet, puis passé à ESLint avec la configuration du dépôt. Le test vérifie que `@nx/enforce-module-boundaries` refuse chaque import interdit et admet chaque import légitime.

| Règle d'AGENTS.md                                         | Vérification                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. Le domaine est du TypeScript pur                       | NestJS, Prisma, Express, AMQP et les autres couches sont refusés au domaine                                          |
| 2. L'application ne dépend que du domaine et de ses ports | NestJS, Prisma, AMQP et l'infrastructure sont refusés à l'application                                                |
| 4. Aucun contexte n'importe un autre contexte             | Pour chaque paire de contextes et chaque couche, l'import est refusé ; l'application (`apps/api`) peut les assembler |
| 11. Le socle ne dépend d'aucun métier                     | Toute lib métier est refusée à `libs/platform`                                                                       |

Chaque dossier `libs/api/<zone>` ou `libs/web/<zone>` doit être soit un contexte déclaré dans `BOUNDED_CONTEXTS` (`eslint.config.mjs`), avec le tag `context:<zone>` sur chacune de ses libs, soit un dossier technique connu (`shared`, `auth`, `brand`, `ui`). Un nouveau dossier qui ne serait ni l'un ni l'autre fait échouer les tests : un contexte ne peut pas échapper aux contraintes faute d'avoir été déclaré.

```bash
pnpm nx run architecture:test
```

**Sans cache, et à chaque CI.** Ces tests inspectent les tags de tous les projets et la configuration ESLint de la racine. Aucun de ces fichiers n'appartient au projet `architecture` : `nx affected` ne le sélectionnerait pas quand un tag change, et un résultat en cache resterait vert après une régression. Leur cache est donc désactivé, et la CI les lance à chaque fois, en plus des projets touchés. Ils durent environ une seconde.

La règle 3, qui fait des contrôleurs des adaptateurs appelant des use cases, relève de la revue : la lint ne distingue pas un contrôleur d'un repository dans la même couche.
