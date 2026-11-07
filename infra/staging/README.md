# Déploiement du staging

`deploy.sh` met en service sur le staging la version publiée d'un commit de `main`, ou revient à la version précédente (US-005 B2a, #47). Il est lancé sur le VPS, en root, depuis le clone du dépôt :

```bash
sudo /opt/trame/source/infra/staging/deploy.sh <commit>    # commit complet, 40 caractères
sudo /opt/trame/source/infra/staging/deploy.sh --rollback
```

Il suppose la stack `trame-shared` démarrée et provisionnée (`infra/compose/shared.yml`, `infra/provisioning`), ainsi que `docker`, `git`, `tar`, `curl`, `python3`, `oras` et `cosign` installés. Le runbook de l'étape 4 donne l'installation et l'ordre complet.

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
3. **Vérification** par `tools/release-images/verify-release.sh`, avec la même politique que `release-images verify` (infra/docker/README.md). Elle écrit `<commit>.env`. Une version refusée arrête tout : rien n'est préchargé, migré ni redémarré.
4. **Extraction** de `infra/compose/staging.yml` au commit vérifié (`git archive`). La signature lie les images au commit, et git lie le fichier Compose au même commit. Le clone n'est mis à jour que s'il n'a pas encore ce commit.
5. **Préchargement** des six images par digest. Une image introuvable arrête tout.
6. **Sauvegarde** de `trame_staging` (`pg_dump`, format custom). Sans sauvegarde, pas de migration. Ce filet local attend la sauvegarde chiffrée hors du VPS d'US-008.
7. **Migration** par le migrator seul (`docker compose run --rm migrator`), avec le rôle `trame_staging_migrator`. Elle passe à part, avant la bascule : lancée par `docker compose up`, une migration en échec laisse déjà recréés les services qui n'en dépendent pas (moteur et worker), et arrête les autres. Un échec arrête tout, et les services restent sur la version en service.
8. **Bascule** de `api`, `relay`, `engine`, `worker` et `web` : `docker compose up --wait`, sondes réussies en 60 secondes. `--no-deps` évite de relancer le migrator. Compose redémarre le front après chaque recréation de l'API : nginx ne résout son adresse qu'au démarrage.
9. **Contrôles externes**, répétés 30 fois à 2 secondes d'intervalle, le temps que Traefik découvre les conteneurs et, au premier déploiement, obtienne les certificats :
   - `https://staging.trame.wkhach.dev/health` répond 200 ;
   - `…/api/v1/health/ready` répond 200 ;
   - `…/api/v1/sites`, sans jeton, répond 401 en `application/problem+json` ;
   - l'émetteur de `https://auth.trame.wkhach.dev/realms/trame-staging/.well-known/openid-configuration` est exact.
10. **Succès** : le commit est noté dans `current`, et l'ancien dans `previous`. Redéployer la version en service ne change pas `previous`.

## Échecs et retours arrière

- **Bascule ou contrôle externe en échec** : le script nomme le service ou le contrôle en échec, garde les journaux de la version dans `<commit>.failure.log` (sa recréation les efface), puis redémarre le point de restauration. `current` et `previous` ne changent pas.
- **Premier déploiement en échec** : il n'y a rien à restaurer. Seuls les services du staging sont arrêtés, et leurs conteneurs gardés pour le diagnostic. Les volumes, les données et la stack `trame-shared` ne sont pas touchés.
- **Retour arrière volontaire** (`--rollback`) : redéploie `previous`, de nouveau vérifiée, sans sauvegarde ni migration. Il n'y a pas de migration descendante : l'expand/contract (ADR-0022) garantit que la version précédente fonctionne sur le schéma migré. Ensuite, `current` et `previous` sont échangées. Un retour en échec revient à la version en service, comme un déploiement.
- **Migration en échec** : les services restent sur la version en service, rien ne presse. Le motif est affiché par le migrator. Pour diagnostiquer :

  ```bash
  cd /opt/trame/staging/releases
  TRAME_SECRETS_DIR=/opt/trame/staging/secrets docker compose --project-name trame-staging \
    --env-file <commit>.env --file <commit>/infra/compose/staging.yml \
    run --rm --no-deps migrator migrate status
  ```

  Une migration marquée en échec se résout par `migrate resolve` (Prisma), ou par la restauration de la sauvegarde si des données ont été touchées. Le runbook de l'étape 4 détaille les deux.

## Bascule interrompue

`attempt-restore-point` est écrit juste avant la bascule et retiré une fois son issue connue. S'il reste au lancement suivant (session SSH coupée, retour lui-même en échec), le script signale que l'état des services est incertain. Le nouveau déploiement garde pour point de restauration la version de `current`, qui n'est mise à jour qu'après un succès.

Pour éviter qu'une coupure SSH n'interrompe une bascule, lancer le script dans `tmux`.

## Codes de sortie

| Code | Sens                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Version en service                                                                                                                |
| 1    | Version refusée ou en échec : les services sont sur la version d'avant la tentative                                               |
| 2    | Usage                                                                                                                             |
| 3    | Déploiement impossible pour l'instant, sans rien toucher : autre déploiement en cours, outil ou dossier absent, clone injoignable |
| 4    | Retour en échec : état des services incertain, intervention requise                                                               |

Après un code 4 : `docker compose --project-name trame-staging ps --all` et `logs` nomment le service en cause. Une fois la cause réglée, redéployer la version de `current`.

## Limites connues

- `relay` et `worker` n'ont pas de sonde : `--wait` ne détecte pas leur échec. Le critère de réussite de B2b (un diagnostic lancé depuis le front aboutit) couvre cette chaîne.
- Aucun contrôle externe ne suit un retour : il retrouve une version déjà contrôlée.
- Sauvegardes et dossiers de versions ne sont pas purgés. La rotation viendra avec la sauvegarde hors du VPS (US-008).
- Les adresses publiques sont fixes. La répétition de l'étape 4 déterminera comment les viser sans DNS ni TLS.

## Tests

`pnpm nx test infra` joue chaque scénario dans `infra/src/staging-deploy.spec.ts`, avec un vrai git et le vrai vérificateur, mais de faux `docker`, `oras`, `cosign`, `curl` et `sleep` (`infra/src/fixtures/staging-host`). Le comportement réel de Docker Compose sur lequel reposent les étapes 7 et 8 (migration à part, `--no-deps`, redémarrage du front) a été vérifié à la main sur Docker 29 et Compose 5.6 ; la répétition de l'étape 4 le rejoue avec les vraies images.
