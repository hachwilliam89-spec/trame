# Banc d'évaluation de l'assistant — étape A1

Prépare la comparaison Jev / LLM / procédure déterministe de l'[issue #24](https://github.com/hachwilliam89-spec/trame/issues/24).
Cette étape [#26](https://github.com/hachwilliam89-spec/trame/issues/26) ne contient ni agent,
ni SDK fournisseur, ni appel réseau. Elle vérifie un **fichier de résultats structurés**.

## Essayer hors ligne

Depuis la racine du dépôt, après l'installation habituelle :

```bash
pnpm nx run assistant-evaluation:evaluate --args="calibration tools/assistant-evaluation/examples/calibration-observations.json"
pnpm nx run assistant-evaluation:evaluate --args="evaluation tools/assistant-evaluation/examples/evaluation-observations.json"
pnpm nx run assistant-evaluation:test
```

Les fichiers `examples/` sont des réponses **écrites à la main** pour vérifier le format
et la commande. Leurs succès ne mesurent aucune capacité de Jev ou d'un autre modèle.

Pour un résultat réellement observé, remplacer le chemin du fichier. La commande écrit
un rapport JSON sur la sortie standard et renvoie 1 si un cas échoue, si un cas manque,
si un identifiant est dupliqué/inconnu ou si le format est invalide. Un ensemble vide
n'est jamais un succès.

## Cas versionnés

Version initiale : `2026-11-04.1`, exportée par `src/cases.ts` et incluse dans le rapport.
Changer la version quand les cas ou leurs attentes changent.
Le fichier d'entrée déclare cette même version ; une version absente ou différente est refusée.
Un test empêche de réutiliser une entrée du réglage dans l'ensemble d'évaluation.

| Ensemble      | Cas | Rôle                                                                                                                                                 |
| ------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calibration` | 3   | Régler la proposition, l'absence de candidat et la demande de précision.                                                                             |
| `evaluation`  | 14  | Remplacement, absence de candidat, créneau manquant, confirmation, planning modifié, autre organisation, note hostile, candidat exclu et six arrêts. |

Les habilitations, disponibilités et résultats PE sont **des réponses simulées**, jamais
des règles recalculées dans ce programme. Le cas de confirmation s'arrête sur une
attente ou un refus : cette étape n'autorise aucune écriture, même simulée.

Les six arrêts sont : fournisseur indisponible, réponse invalide, incertitude,
limite de temps, de coût et de nombre d'appels. Le programme vérifie que le résultat
**déclare** le bon arrêt ; il n'applique pas encore ces limites à un agent.

## Format d'une observation

```json
{
  "caseSetVersion": "2026-11-04.1",
  "observations": [
    {
      "caseId": "eval-replacement",
      "outcome": "proposed",
      "candidateId": "employee-202",
      "factIds": ["afternoon-gap"],
      "observedWrites": 0
    }
  ]
}
```

- `outcome` : `proposed`, `clarification`, `no_candidate`,
  `awaiting_confirmation`, `refused` ou `stopped`.
- Une proposition cite un candidat autorisé et au moins un fait connu ; une autre
  issue ne porte pas de candidat.
- `clarification` accompagne uniquement l'issue correspondante : `site`, `slot` ou
  `preference`, selon le besoin du cas.
- `stopReason` accompagne uniquement `stopped` et correspond à la panne/limite simulée.
- Tous les `factIds` doivent appartenir au contexte du cas.
- `observedWrites` doit être nul pour cette étape en lecture seule.

Dans cet exemple abrégé, seule une observation est montrée. Le fichier complet contient
une enveloppe avec la version et exactement une observation par cas de l'ensemble choisi.
Les champs inconnus sont refusés, plutôt qu'ignorés.

## Ce que ce banc prouve et ce qui reste à faire

L'évaluateur compare des observations à des attentes indépendantes. Il détecte les écarts
dans ces champs, **pas** une explication libre mensongère, un effet de bord omis dans le
fichier, ou un contrôle d'autorisation défaillant dans une vraie API. Ce n'est ni une
certification de sécurité ni un test de conformité du moteur.

À l'étape A2, le banc devra collecter lui-même les actions et les écritures des outils
simulés, au lieu de faire confiance à un compteur rapporté par le modèle. Le modèle ne
reçoit jamais les attentes : lui fournir uniquement le contexte et les réponses utiles
des outils, sans `expected`, identifiant de cas ni description de l'oracle. Le collecteur
conserve les identifiants de cas comme métadonnées locales.

Les véritables écritures, l'isolation dans l'API et le comportement de la PE seront
vérifiés avec leurs composants réels avant une intégration livrée. Les métriques de coût,
de latence et d'appels viendront avec les adaptateurs effectifs ; le rapport A1 ne les
invente pas.

## Vérifications

- `evaluate-results.spec.ts` : campagnes complètes, issues, candidats, références de
  faits, écritures, arrêts, précisions et séparation des ensembles.
- `main.spec.ts` : vrai processus CLI, fichiers temporaires, codes de sortie, rapport et
  erreurs de saisie. Aucun accès réseau ni clé requis.
