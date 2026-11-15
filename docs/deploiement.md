# Déploiement de Trame — cadrage

Statut : 15 novembre 2026. Le staging est en service sur le VPS depuis la nuit du 14 au 15 novembre 2026, à la version `acf8537` : `https://staging.trame.wkhach.dev`, avec Keycloak sur `https://auth.trame.wkhach.dev`. La mise en service a suivi [le runbook du staging](../infra/staging/RUNBOOK.md) ; la suite est suivie dans [US-005, #39](https://github.com/hachwilliam89-spec/trame/issues/39).

## Domaines retenus

Kim a délégué le choix à une solution cohérente et professionnelle :

| Usage            | Adresse                            | API                        |
| ---------------- | ---------------------------------- | -------------------------- |
| Production       | `https://trame.wkhach.dev`         | `/api/v1` sur ce domaine   |
| Staging          | `https://staging.trame.wkhach.dev` | `/api/v1` sur ce domaine   |
| Keycloak partagé | `https://auth.trame.wkhach.dev`    | Un realm par environnement |

Les domaines sont retenus pour la configuration. Les enregistrements DNS du staging et de Keycloak sont créés (zone `wkhach.dev`, chez Porkbun) et leurs certificats émis par Let's Encrypt. Le domaine de production reste à mettre en service. Le front et l'API conservent la même origine ; seul le fournisseur OIDC a son domaine propre, avec origines et callbacks exacts.

## Découpage proposé

1. **US-005 A — images et preuve locale**, [#40](https://github.com/hachwilliam89-spec/trame/issues/40) : Dockerfiles multi-stage, processus Node compilés, moteur installé depuis le lockfile, serveur du front non root, cible de migration distincte, configuration au démarrage et parcours complet sur les images réelles. Scénarios et plan validés par Kim le 5 novembre 2026 ; livrée par [#42](https://github.com/hachwilliam89-spec/trame/pull/42).
2. **US-005 B — publication et staging**, découpée le 6 novembre 2026 :
   - **B1 — publication** ✅, livrée le 6 novembre 2026 ([#45](https://github.com/hachwilliam89-spec/trame/pull/45), issue [#44](https://github.com/hachwilliam89-spec/trame/issues/44), première publication sur `db4100e`, run [42219643979](https://github.com/hachwilliam89-spec/trame/actions/runs/42219643979)) : images de la tête de `main` scannées (Trivy), avec SBOM et provenance, poussées sans reconstruction sur GHCR, signées sans clé (cosign) pour leur commit, et un manifeste de version signé qui marque la publication comme terminée. Aucune intervention sur le VPS. Voir [la publication des images](../infra/docker/README.md#publication-us-005-b1).
   - **B2 — staging**, après US-013 ([#47](https://github.com/hachwilliam89-spec/trame/issues/47)) :
     - **B2a — préparation** ✅ : stacks Compose derrière Traefik, provisionnement, `deploy.sh` par digests vérifiés avec retour automatique, répétition complète en CI, navigateur compris ([déploiement du staging](../infra/staging/README.md)) ;
     - **B2b — mise en service** ✅ : faite par Kim dans la nuit du 14 au 15 novembre 2026, sur la version `acf8537`, commande par commande ([runbook](../infra/staging/RUNBOOK.md)). Constat de Kim et de Codex après le déploiement : le parcours réel fonctionne (connexion avec TOTP, diagnostic, « Les trois tâches ont été affectées »), KCD et Équilibre répondent toujours, environ 9 Gio de mémoire restent disponibles sans swap, aucun conteneur n'a été tué ni relancé, et Keycloak occupe environ 564 Mio sur 1 Gio. C'est un relevé au repos après un diagnostic court, pas une preuve de tenue en charge. Les sauvegardes et leur restauration (US-008) restent à finaliser.
3. **US-005 C — promotion/retour arrière** : même image que staging, release, API précédente compatible avec les migrations et production fermée avant protection de démo.

La première tranche ne clôture pas US-005. Les sauvegardes/restaurations (US-008) et la trace distribuée (US-007) restent nécessaires à la preuve déployée d'US-009. Les commandes de mise en service seront présentées avec leur retour arrière avant exécution.

## Précontrôle du VPS

Inventaire SSH en lecture seule le 5 novembre 2026 ; seules les propriétés utiles ont été lues, sans exporter les variables des conteneurs :

- Neuf conteneurs en cours d'exécution ; Trame absent de cet inventaire.
- Seul Traefik publie des ports Docker sur l'hôte : 80/443 TCP et 443 UDP. Les autres ports listés sont internes.
- Traefik a `json-file`, `max-size=10m`, `max-file=3`.
- Les huit autres conteneurs ont `json-file` sans `max-size` ni `max-file` dans leur configuration.
- `equilibre-web` et `equilibre-telechargements` n'ont pas de label de projet Compose ; les autres conteneurs sont rattachés à leurs projets.
- Le dépôt local `vps-edge` présente des modifications dans le README et trois scripts de durcissement. Conserver et réviser ces modifications avant de figer la version à appliquer.

Ces observations confirment le préalable **US-013 avant mise en service** : reprendre les deux conteneurs hors Compose, plafonner les logs, puis contrôler SSH, ports et routes. Aucune configuration, aucun conteneur ni service de l'hôte n'a été modifié pendant ce précontrôle.

Contrôle de la nuit du 14 au 15 novembre 2026, avant la mise en service : US-013 est appliquée sur le VPS. `host/check.sh` de `vps-edge` passe ses treize contrôles (SSH par clé seule, UFW, fail2ban, mises à jour automatiques, logs plafonnés par `daemon.json` avec `live-restore`, seul Traefik publie des ports), et les deux conteneurs web d'Équilibre sont rattachés au projet Compose `equilibre-static`. Le contrôle externe complet (`check-externe.sh --complet`) n'a pas été rejoué à cette occasion.

Un changement de configuration de logs ne s'applique pas automatiquement aux conteneurs existants : Docker impose leur recréation avec les nouvelles options. Le plan opérationnel devra donc préserver les données et vérifier les routes des projets déjà hébergés. [Source : Docker, configuration des pilotes de logs](https://docs.docker.com/engine/logging/configure/).

## Vérifications avant mise en service

- US-013 appliquée sur une version de scripts revue, avec contrôles locaux/externes et routes inchangées.
- Bases/vhosts/realms séparés ; comptes de test du realm local réservés aux tests isolés. Compte de migration distinct du compte applicatif, ce dernier sans DDL.
- Aucun port applicatif publié sur l'hôte, aucune base sur le réseau `edge`, noms de routeurs préfixés `trame-` (ADR-0016).
- Accès au staging : public, protégé par OIDC avec TOTP obligatoire et par la détection de force brute de Keycloak, sans protection de proxy en plus (décision du 6 novembre 2026, #47). La console d'administration et le realm `master` ne sont joignables que par un tunnel SSH (ADR-0016, ADR-0034).
- Budget mémoire réévalué : l'estimation du cadrage ne remplace pas une mesure et doit inclure les processus de relais ajoutés avec A2.
- Versions, architectures et digests des images vérifiés sur les registres officiels, notamment Linux amd64 et les roues OR-Tools/Python.
- Sauvegarde chiffrée hors VPS et restauration testée avant données réelles ; backend de stockage et secrets à définir dans US-008.
- Retour arrière concret, sondes et preuve locale/CI avant validation du staging. Une corrélation par runId n'est pas encore la trace Grafana attendue.
