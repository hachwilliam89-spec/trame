# Acquittement après commit

`acknowledgeAfterCommit(commit, acknowledge)` attend la fin de l'écriture avant de confirmer
la livraison. Si l'écriture échoue, il laisse le message non acquitté ; le transport décide
de sa reprise. La lib ne dépend d'aucun moteur de stockage.

Cette fonction ne remplace pas une inbox persistante : l'adaptateur consommateur conserve
le reçu et la modification métier dans **la même transaction**, avec une contrainte unique
sur l'identifiant reçu. Le diagnostic de scheduling le vérifie sur PostgreSQL réel.

Vérification : `pnpm nx test platform-inbox`.
