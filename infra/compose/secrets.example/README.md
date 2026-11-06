# Modèles des secrets des stacks déployées

Un fichier par service, avec les noms des variables et **sans aucune valeur**. Sur le VPS, chaque stack lit ses secrets dans `TRAME_SECRETS_DIR` (`/opt/trame/<stack>/secrets`, propriétaire root, droits `0600`), jamais dans le dépôt. Les valeurs sont générées par `openssl rand -base64 32`. Un secret par service ; rien n'est partagé entre le staging et la production.

Les mots de passe des rôles PostgreSQL et des utilisateurs RabbitMQ sont ceux donnés au provisionnement (`infra/provisioning`).
