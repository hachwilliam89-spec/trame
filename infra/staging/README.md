# Déploiement du staging

`deploy.sh` met en service sur le staging la version publiée d'un commit de `main`, ou revient à la version précédente (US-005 B2a, #47). Il est lancé sur le VPS, en root, depuis le clone du dépôt :

```bash
sudo /opt/trame/source/infra/staging/deploy.sh <commit>    # commit complet, 40 caractères
sudo /opt/trame/source/infra/staging/deploy.sh --rollback
```

Il suppose la stack `trame-shared` démarrée et provisionnée (`infra/compose/shared.yml`, `infra/provisioning`), ainsi que `docker`, `git`, `tar`, `curl`, `python3`, `oras` et `cosign` installés. `oras` et `cosign` s'installent par `install-release-tools.sh`, aux versions et sommes de contrôle de la CI qui signe les versions :

```bash
sudo /opt/trame/source/infra/staging/install-release-tools.sh    # dans /usr/local/bin
```

[RUNBOOK.md](RUNBOOK.md) donne l'ordre complet de la mise en service, commande par commande.

## Fichiers sur le VPS

```
/opt/trame/
  source/                    clone du dépôt public, en HTTPS et sans identifiant
  staging/
    secrets/                 un fichier d'environnement par service (modèles : infra/compose/secrets.example/staging)
    deploy.lock              verrou : un seul déploiement à la fois
    backups/                 sauvegardes logiques de trame_staging, prises avant chaque migration
    releases/
      current                version en service
      previous               version en service avant elle
      <commit>.env           les six digests vérifiés de la version
      <commit>/infra/compose/staging.yml
      <commit>.failure.log   journaux d'une version retirée après un échec
      attempt-restore-point  présent pendant une bascule (voir « Bascule interrompue »)
```

Tous ces fichiers ne sont lisibles que par root.

## Déroulé

1. **Verrou.** Un second lancement s'arrête sans rien toucher.
2. **Point de restauration.** La version en service au début de la tentative. C'est vers elle, et non vers `previous`, qu'un échec revient : si A est en service, B avant elle, et que C échoue, A revient.
3. **Vérification** par `tools/release-images/verify-release.sh`, avec la même politique que `release-images verify` (infra/docker/README.md). Elle écrit `<commit>.env`. Une version refusée arrête tout : rien n'est préchargé, migré ni redémarré. Chaque appel à Docker Compose reçoit ensuite les six digests de ce fichier dans son environnement : une variable `TRAME_<IMAGE>_DIGEST` exportée dans le shell l'emporterait sinon sur `--env-file`.
4. **Extraction** de `infra/compose/staging.yml` au commit vérifié (`git archive`). La signature lie les images au commit, et git lie le fichier Compose au même commit. Le clone n'est mis à jour que s'il n'a pas encore ce commit.
5. **Préchargement** des six images par digest. Une image introuvable arrête tout.
6. **Sauvegarde** de `trame_staging` (`pg_dump`, format custom). Sans sauvegarde, pas de migration. Ce filet local attend la sauvegarde chiffrée hors du VPS d'US-008.
7. **Migration** par le migrator seul (`docker compose run --rm migrator`), avec le rôle `trame_staging_migrator`. Elle passe à part, avant la bascule : lancée par `docker compose up`, une migration en échec laisse déjà recréés les services qui n'en dépendent pas (moteur et worker), et arrête les autres. Un échec arrête tout, et les services restent sur la version en service.
8. **Bascule** de `api`, `relay`, `engine`, `worker` et `web` : `docker compose up --wait`, sondes réussies en 60 secondes. `--no-deps` évite de relancer le migrator. Compose redémarre le front après chaque recréation de l'API : nginx ne résout son adresse qu'au démarrage.
9. **Contrôles externes**, répétés toutes les 2 secondes pendant 60 secondes au plus, le temps que Traefik découvre les conteneurs et, au premier déploiement, obtienne les certificats. L'échéance est prise sur l'horloge monotone du système : chaque requête (10 secondes au plus) et chaque pause sont bornées au temps restant. Contrôles :
   - `https://staging.trame.wkhach.dev/health` répond 200 ;
   - `…/api/v1/health/ready` répond 200 ;
   - `…/api/v1/sites`, sans jeton, répond 401 en `application/problem+json` ;
   - l'émetteur de `https://auth.trame.wkhach.dev/realms/trame-staging/.well-known/openid-configuration` est exact.
10. **Succès** : le commit est noté dans `current`, et l'ancien dans `previous`. Redéployer la version en service ne change pas `previous`.

## Échecs et retours arrière

- **Bascule ou contrôle externe en échec** : le script nomme le service ou le contrôle en échec, garde les journaux de la version dans `<commit>.failure.log` (sa recréation les efface), puis redémarre le point de restauration. Celui-ci repasse les contrôles externes : il n'est déclaré de nouveau en service que s'il répond. Sinon, le script sort en 4. `current` et `previous` ne changent pas.
- **Premier déploiement en échec** : il n'y a rien à restaurer. Seuls les services du staging sont arrêtés, et leurs conteneurs gardés pour le diagnostic. Les volumes, les données et la stack `trame-shared` ne sont pas touchés.
- **Retour arrière volontaire** (`--rollback`) : redéploie `previous`, de nouveau vérifiée, sans sauvegarde ni migration. Il n'y a pas de migration descendante : l'expand/contract (ADR-0022) garantit que la version précédente fonctionne sur le schéma migré. Ensuite, `current` et `previous` sont échangées. Un retour en échec revient à la version en service, comme un déploiement.
- **Migration en échec** : les services restent sur la version en service, rien ne presse. Le motif est affiché par le migrator. Pour diagnostiquer :

  ```bash
  cd /opt/trame/staging/releases
  # Les digests de la version passent dans l'environnement, comme dans le script.
  env $(cat <commit>.env) TRAME_SECRETS_DIR=/opt/trame/staging/secrets \
    docker compose --project-name trame-staging --file <commit>/infra/compose/staging.yml \
    run --rm --no-deps migrator migrate status
  ```

  Une migration marquée en échec se résout par `migrate resolve` (Prisma), ou par la restauration de la sauvegarde si des données ont été touchées. [Le runbook](RUNBOOK.md#migration-en-échec) donne la commande de restauration.

## Bascule interrompue

`attempt-restore-point` est écrit juste avant la bascule et retiré une fois son issue connue. S'il reste au lancement suivant (session SSH coupée, retour en échec ou version restaurée injoignable), le script signale que l'état des services est incertain. Le nouveau déploiement garde pour point de restauration la version de `current`, qui n'est mise à jour qu'après un succès.

Pour éviter qu'une coupure SSH n'interrompe une bascule, lancer le script dans `tmux`.

## Codes de sortie

| Code | Sens                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Version en service                                                                                                                |
| 1    | Version refusée ou en échec : les services sont sur la version d'avant la tentative                                               |
| 2    | Usage                                                                                                                             |
| 3    | Déploiement impossible pour l'instant, sans rien toucher : autre déploiement en cours, outil ou dossier absent, clone injoignable |
| 4    | Retour en échec, ou version restaurée injoignable : état des services incertain, intervention requise                             |

Après un code 4 : `docker compose --project-name trame-staging ps --all` et `logs` nomment le service en cause. Une fois la cause réglée, redéployer la version de `current`.

## Limites connues

- `relay` et `worker` n'ont pas de sonde : `--wait` ne détecte pas leur échec. Un diagnostic lancé depuis le front couvre cette chaîne : la répétition le joue, et c'est un critère de réussite de B2b.
- Sauvegardes et dossiers de versions ne sont pas purgés. La rotation viendra avec la sauvegarde hors du VPS (US-008).
- Les adresses publiques sont fixes. La répétition les fait pointer vers le runner par `/etc/hosts`, avec une autorité de test (voir « Répétition »).

## Répétition

`.github/workflows/rehearsal.yml` répète ce déploiement sur un runner jetable (`infra/src/staging.rehearsal.spec.ts`).

- **Quand** :
  - sur chaque PR qui touche `infra/`, `tools/release-images/` ou ce workflow : régression du script contre les deux dernières versions publiées de `main` ;
  - **à la demande, avant B2b**, sur le commit exact à mettre en service : `gh workflow run rehearsal.yml -f version=<commit>` (et `-f previous=<commit>` pour imposer la version d'avant).
- **Réel** : `deploy.sh` tel quel, les versions publiées et signées avec leur vraie vérification, `oras` et `cosign` installés par `install-release-tools.sh`, la stack partagée provisionnée par `infra/provisioning`, et Traefik à l'image et à la configuration de `vps-edge` (`infra/compose/rehearsal-edge.yml`, `infra/rehearsal`).
- **Remplacé**, sans jamais désactiver la vérification TLS :
  - le DNS public, par `/etc/hosts` du runner pour curl, et par les règles de résolution de Chromium pour le navigateur, qui tourne dans son propre conteneur ;
  - Let's Encrypt, par une autorité de test. curl la reconnaît par `CURL_CA_BUNDLE`. Chromium la lit dans sa base de certificats NSS, où la répétition l'ajoute avec `certutil` ; un certificat d'un autre nom y reste refusé, ce qu'un test vérifie ;
  - le proxy du socket Docker de `vps-edge`, qui ne fait que restreindre cet accès.
- **Parcours** : version précédente, version visée, `--rollback`, puis de nouveau la version visée. Ensuite :
  - aucun port publié par les conteneurs de Trame ;
  - d'un client extérieur, seuls 80 et 443 répondent ;
  - la console de Keycloak ne s'ouvre que par le tunnel, et `/admin/` comme `/realms/master/` répondent 404 par Traefik ;
  - **dans un navigateur** :
    - la console d'administration s'ouvre et se connecte par le tunnel, sans aucune requête vers l'adresse publique (ADR-0034) ;
    - un compte créé par l'API d'administration, avec un mot de passe temporaire et le rôle `manager`, se connecte depuis `https://staging.trame.wkhach.dev` : Keycloak impose l'enrôlement du TOTP et le changement du mot de passe ;
    - un diagnostic lancé depuis le front aboutit, ce qui couvre `relay` et `worker`, sans sonde ;
    - le navigateur ne joint que les deux noms publics, et Traefik ne refuse aucune requête par sa limite de débit ;
  - mémoire relevée toutes les 2 secondes, diagnostic compris, et aucun conteneur tué ni redémarré.
- **Preuve** : l'artefact `repetition-staging` et le résumé du job donnent le SHA du script, ceux des deux versions, leurs digests vérifiés, les versions d'`oras` et de `cosign`, le maximum de mémoire de chaque conteneur, et les requêtes que Traefik a reçues pendant la connexion et le diagnostic (nombre, pic sur une seconde, refus), lues dans son journal d'accès.
- **Limites** :
  - le retour sur un schéma migré n'est prouvé que si une migration sépare les deux versions. La première version qui ajoute une migration est répétée à la demande avec la précédente avant sa mise en service ;
  - le pic de requêtes est celui d'un automate, qui remplit les formulaires en moins d'une seconde : un utilisateur étale les mêmes requêtes ;
  - la mémoire est celle du diagnostic actuel, trois tâches fictives. Le contrôle avec KCD et Équilibre actifs reste à faire sur le VPS.

## Tests

`pnpm nx test infra` joue chaque scénario dans `infra/src/staging-deploy.spec.ts`, avec un vrai git et le vrai vérificateur, mais de faux `docker`, `oras`, `cosign`, `curl` et `sleep` (`infra/src/fixtures/staging-host`). Le temps des contrôles externes y est simulé : faux `curl` et faux `sleep` avancent une horloge que le faux `python3` donne au script, sans attendre. Le faux `docker` interpole les digests comme Docker Compose, où une variable du shell l'emporte sur `--env-file`. Le comportement réel de Docker Compose sur lequel reposent les étapes 7 et 8 (migration à part, `--no-deps`, redémarrage du front) a été vérifié à la main sur Docker 29 et Compose 5.6 ; la répétition du staging le rejoue avec les vraies images.
