# `tools/dependency-graph`

Soumet les dépendances du dépôt au graphe de dépendances de GitHub (workflow `dependency-graph.yml`).

## Pourquoi

Le graphe de GitHub ne détecte pas nos dépendances :

- `pnpm-lock.yaml` : pnpm 12 l'écrit en deux documents YAML quand la version de pnpm est figée (`packageManager`), format que le graphe ne lit pas ;
- `apps/engine/uv.lock` : format non pris en charge.

Sans graphe, ni les alertes de vulnérabilité de GitHub ni `dependency-review-action` ne voient nos dépendances.

## Comment

1. `pnpm sbom` et `uv export` produisent chacun deux SBOM CycloneDX : toutes les dépendances, puis celles de production seules.
2. `src/main.ts` les convertit en un instantané de l'API « dependency submission » : un manifeste par fichier de verrouillage, chaque paquet avec sa relation (directe ou indirecte), sa portée (production ou développement) et ses dépendances.
3. Sur `main`, le workflow soumet l'instantané, puis vérifie que le graphe exporté (SBOM de GitHub) contient chaque dépendance directe soumise.

Sur une PR, l'instantané est construit et contrôlé, mais pas soumis : le job n'a que des droits de lecture.

```bash
tsx tools/dependency-graph/src/main.ts <dossier des SBOM> <fichier de sortie>
# Variables : GITHUB_SHA, GITHUB_REF, GITHUB_RUN_ID, SCANNED_AT
```

`verify-graph.sh <instantané>` interroge le graphe jusqu'à y trouver toutes les dépendances directes, ou échoue après environ cinq minutes.
