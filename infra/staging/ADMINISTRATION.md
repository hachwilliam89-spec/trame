# Administrer le staging

Les gestes courants une fois le staging en service : ouvrir la console de Keycloak, créer un compte, réinitialiser un accès, regarder l'état des services. La mise en service et les déploiements sont dans [RUNBOOK.md](RUNBOOK.md).

- Les blocs se collent tels quels : ils ne contiennent aucun texte à remplacer, sauf mention contraire.
- Les libellés de la console sont ceux de Keycloak 26.8, en anglais.
- Aucun agent n'agit sur le VPS ni dans la console : ces gestes sont ceux de Kim.

## Ouvrir la console d'administration

La console et le realm `master` ne sont pas exposés sur Internet (ADR-0016, ADR-0034) : `https://auth.trame.wkhach.dev/admin/` répond 404. On y accède par un tunnel SSH, qui n'existe que tant que sa commande tourne. L'adresse interne de Keycloak change quand son conteneur est recréé : on la relit à chaque fois.

Sur le poste :

```bash
ip=$(ssh ubuntu@staging.trame.wkhach.dev "sudo docker inspect -f '{{(index .NetworkSettings.Networks \"edge\").IPAddress}}' trame-shared-keycloak-1")
echo "$ip"
```

Attendu : une adresse du type `172.x.x.x`. Puis :

```bash
ssh -N -L 18080:$ip:8080 ubuntu@staging.trame.wkhach.dev
```

La commande n'affiche rien et ne rend pas la main : le tunnel est ouvert. Ouvrir alors `http://127.0.0.1:18080/admin/master/console/` et se connecter avec le compte administrateur permanent (mot de passe, puis code TOTP). Ctrl+C dans le terminal ferme le tunnel.

| Symptôme                                     | Cause                                                              | Geste                                 |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| La page ne répond pas                        | Le tunnel est fermé, ou pointe vers l'ancienne adresse de Keycloak | Relancer les deux blocs               |
| `bind: Address already in use`               | Un tunnel tourne déjà dans un autre terminal                       | L'utiliser, ou le fermer avec Ctrl+C  |
| La première commande n'affiche pas d'adresse | Keycloak est arrêté                                                | Voir « Regarder l'état des services » |

## Créer un compte applicatif

Un compte de Trame appartient à une organisation et porte un rôle : `admin`, `manager` ou `employee`. Dans la console, choisir le realm **trame-staging** (et non `master`) dans le sélecteur en haut à gauche.

1. **Users**, **Add user** : renseigner le nom d'utilisateur, l'adresse, le prénom et le nom.
2. Renseigner `organization_id` :
   - pour rejoindre une organisation existante, copier la valeur d'un compte de cette organisation ;
   - pour une nouvelle organisation, générer un identifiant sur le poste avec `uuidgen | tr 'A-Z' 'a-z'`, et le garder : toutes les données de cette organisation le portent.
3. **Create**.
4. Onglet **Credentials**, **Set password** : un mot de passe provisoire, avec **Temporary** activé.
5. Onglet **Role mapping**, **Assign role** : choisir le rôle parmi les rôles du realm.
6. Transmettre le nom d'utilisateur et le mot de passe provisoire par un canal sûr, jamais dans une issue ni dans un commit.

À sa première connexion sur `https://staging.trame.wkhach.dev`, la personne enrôle un code TOTP et choisit son mot de passe.

Deux comptes d'organisations différentes ne voient jamais les données l'un de l'autre : une erreur sur `organization_id` donne un compte qui ne voit rien, ou qui voit les données d'une autre organisation. La vérifier avant de transmettre le compte.

## Réinitialiser un accès

Dans le realm **trame-staging**, **Users**, ouvrir le compte.

| Besoin                    | Geste                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Mot de passe oublié       | **Credentials**, **Reset password** : un mot de passe provisoire, avec **Temporary** activé |
| Téléphone perdu ou changé | **Credentials** : supprimer la ligne `otp`. Puis **Sessions**, **Sign out all sessions**    |
| Compte à suspendre        | Onglet **Details** : désactiver **Enabled**, puis **Save**                                  |
| Compte à supprimer        | Liste **Users** : menu du compte, **Delete**                                                |

Après la suppression de la ligne `otp`, Keycloak impose un nouvel enrôlement à la connexion suivante (vérifié par `staging-realm.integration.spec.ts`). Un jeton d'accès déjà émis reste valide jusqu'à son expiration, 5 minutes au plus : fermer les sessions empêche son renouvellement, pas son usage.

Supprimer un compte ne supprime pas les données de son organisation dans Trame.

## Compte administrateur de Keycloak

Le compte administrateur permanent vit dans le realm `master`, avec un TOTP. Son mot de passe est dans le gestionnaire de mots de passe de Kim, nulle part ailleurs.

S'il perd son mot de passe ou son TOTP, la console n'est plus utilisable : il faut la procédure de récupération de Keycloak ([bootstrap-admin](https://www.keycloak.org/server/bootstrap-admin-recovery)), **jamais jouée ici**. Mieux vaut l'éviter : enrôler le TOTP sur deux appareils, ou garder un second compte administrateur.

## Regarder l'état des services

Sur le VPS, en root :

```bash
ssh ubuntu@staging.trame.wkhach.dev
```

```bash
sudo -i
```

```bash
docker compose -p trame-shared ps
docker compose -p trame-staging ps
cat /opt/trame/staging/releases/current
```

Attendu : chaque service avec un statut `Up … (healthy)`, et le commit de la version en service.

Les journaux d'un service, par exemple l'API :

```bash
docker logs --tail 100 trame-staging-api-1
```

Les journaux sont en JSON et ne contiennent pas de donnée personnelle en clair. Les noms des conteneurs sont ceux qu'affiche `ps`.

Depuis le poste, sans se connecter au VPS :

```bash
curl -s -o /dev/null -w "%{http_code} front\n" https://staging.trame.wkhach.dev/
curl -s -o /dev/null -w "%{http_code} keycloak\n" https://auth.trame.wkhach.dev/realms/trame-staging/.well-known/openid-configuration
```

Attendu : `200 front`, `200 keycloak`.

## Déployer, revenir en arrière, mettre à jour

Voir [RUNBOOK.md](RUNBOOK.md), « Procédures courantes » : déployer une nouvelle version, revenir à la précédente, migration en échec, mise à jour de la stack partagée, retrait du staging.
