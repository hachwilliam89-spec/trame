# Diagnostic — accès aux données web

`DiagnosticApi` est l'adaptateur HTTP, `DiagnosticState` la façade d'état de la page. Leur séparation permet de tester les transitions sans DOM et le transport sans composant. Aucun pattern de cache supplémentaire n'est nécessaire pour ce diagnostic fixe.

- POST avec clé d'idempotence conservée avant l'envoi ; deux clics simultanés sont ignorés pendant l'enregistrement. Une réponse perdue est réessayée avec la même clé.
- GET retrouve le résultat, y compris après rechargement et nouvelle connexion. Le marque-page sessionStorage est isolé par organisation et sujet et ne contient que clé, job, curseur et séquence, jamais des jetons ou résultats.
- Fetch SSE ajoute Authorization et Last-Event-ID ; `eventsource-parser` gère les fragments réseau. Le contrat, le job, l'identifiant et l'ordre sont validés ; les commentaires n'inventent aucun pourcentage.
- Une déconnexion laisse le job côté serveur. La reprise retrouve ce job, sans POST supplémentaire si son identifiant est connu.
- Expiration, refus et changement d'identité effacent l'affichage ; une ancienne réponse ne peut pas le rétablir.
- Un historique 410 se rabat sur le résultat enregistré. OPTIMAL/FEASIBLE/INFEASIBLE/UNKNOWN/CANCELLED restent distincts des statuts techniques.

Les données métier sont conservées par l'API ; les signaux et le marque-page du navigateur ne font pas autorité.
