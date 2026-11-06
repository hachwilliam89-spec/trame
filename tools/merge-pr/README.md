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
   - il **s'arrête** si la PR est fermée, en brouillon, vise une autre branche que `main` ou est en conflit, ou si un check requis a échoué ou a été annulé ;
   - il demande à GitHub de **mettre la branche à jour** si elle est en retard sur `main`, puis attend les checks du nouveau commit ;
   - il **attend** tant qu'un check requis est absent, en cours, neutre ou ignoré. `gh` range un verdict neutre avec les checks ignorés. Juste après une mise à jour de branche, le script s'est déjà arrêté sur « CodeQL », qui a fini vert peu après : un passage transitoire par ce verdict neutre est l'explication la plus probable, sans être confirmée. Un check qui resterait ignoré épuise le délai, sans fusion ;
   - il **fusionne** une fois tous les checks requis réussis, avec `--match-head-commit` : GitHub refuse la fusion si un commit est arrivé depuis la vérification.
3. Le délai est une échéance mesurée sur une horloge monotone, qui ne dépend pas de l'heure du système. Le temps des commandes `gh` compte autant que les pauses :
   - chaque commande `gh` est interrompue si elle dépasse le temps restant, et n'est pas lancée une fois l'échéance atteinte ;
   - la dernière pause est raccourcie au temps restant ;
   - à l'échéance, le script s'arrête sans fusionner. Si la fusion elle-même est interrompue, il dit que le résultat est incertain et donne la commande pour vérifier.

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
- `merge-pull-request.spec.ts` : la boucle complète avec un faux `gh` qui rejoue des réponses, chacune avec sa durée sur une horloge simulée ;
- `deadline.spec.ts` et `command-runner.spec.ts` : l'échéance, et l'interruption d'une vraie commande trop longue ;
- `local-checkout.spec.ts` : la mise à jour du poste avec un vrai Git, dans des dossiers temporaires ;
- `main.spec.ts` : la commande lancée avec un exécutable `gh` factice placé dans le `PATH`.

Aucun test ne contacte GitHub.
