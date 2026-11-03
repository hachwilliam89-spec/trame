# `tools/merge-pr`

Fusionne une PR en squash quand tous ses checks requis ont réussi, puis met `main` à jour sur le poste.

```bash
pnpm pr:merge 22                 # attend au plus 30 minutes
pnpm pr:merge 22 --timeout 45
```

## Pourquoi

Une fusion lancée trop tôt est refusée, parce que les checks requis ne sont pas encore créés. Une fusion lancée à la main peut aussi emporter un commit arrivé après la vérification. Le script n'avance donc que sur des preuves.

## Comment

1. Il lit les checks exigés par la protection de `main`, et refuse de continuer si `CI OK` ou `CodeQL` n'en font pas partie.
2. Toutes les 20 secondes, il relit la PR et ses checks, puis :
   - il **s'arrête** si la PR est fermée, en brouillon, vise une autre branche que `main` ou est en conflit, ou si un check requis a échoué, a été annulé ou a été ignoré ;
   - il demande à GitHub de **mettre la branche à jour** si elle est en retard sur `main`, puis attend les checks du nouveau commit ;
   - il **attend** tant qu'un check requis est absent ou en cours ;
   - il **fusionne** une fois tous les checks requis réussis, avec `--match-head-commit` : GitHub refuse la fusion si un commit est arrivé depuis la vérification.
3. Le délai dépassé, il s'arrête sans fusionner.

Il n'utilise jamais `--admin` et ne relance rien après un refus.

Après la fusion, il met à jour le poste sans toucher aux modifications locales :

| Situation                                      | Effet                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Sur `main`                                     | `git pull --ff-only`                                                               |
| Sur la branche fusionnée, sans modification    | passage sur `main`, mise à jour, suppression de la branche locale                  |
| Sur la branche fusionnée, avec des changements | on reste sur la branche ; `main` est avancée à côté (`git fetch origin main:main`) |
| Sur une autre branche                          | `main` est avancée à côté                                                          |

La branche locale n'est supprimée que si elle pointe exactement sur le commit fusionné : un commit local non poussé la garde. La branche distante est supprimée par GitHub (option « Automatically delete head branches »).

## Tests

- `merge-decision.spec.ts` : décision pure, pour chaque état de PR et de checks ;
- `merge-pull-request.spec.ts` : la boucle complète avec un faux `gh` qui rejoue des réponses ;
- `local-checkout.spec.ts` : la mise à jour du poste avec un vrai Git, dans des dossiers temporaires ;
- `main.spec.ts` : la commande lancée avec un exécutable `gh` factice placé dans le `PATH`.

Aucun test ne contacte GitHub.
