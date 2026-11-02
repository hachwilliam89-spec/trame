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
3. Sur `main`, le workflow soumet l'instantané, puis vérifie que le graphe exporté contient chaque paquet soumis, direct ou transitif : les alertes de vulnérabilité portent sur les deux.

Sur une PR, l'instantané est construit et contrôlé, mais pas soumis : le job n'a que des droits de lecture.

```bash
tsx tools/dependency-graph/src/main.ts <dossier des SBOM> <fichier de sortie>
# Variables : GITHUB_SHA, GITHUB_REF, GITHUB_RUN_ID, SCANNED_AT
```

`verify-graph.sh <instantané>` compare l'instantané au graphe par l'export SBOM asynchrone de GitHub : demande d'un rapport (`sbom/generate-report`), attente tant que sa récupération répond 202, puis téléchargement par la redirection 302. Il recommence tant que des paquets manquent, et échoue après une quinzaine de minutes en listant les absents. L'export synchrone (`GET …/dependency-graph/sbom`) ferme le 13 novembre 2026.
