# Trame — Backlog v0.1 (MVP)

**Objectif de la v0.1** : un manager génère, ajuste avec la PE et publie le planning hebdomadaire d'un site. Le tout est déployé en production, documenté, observé, et accessible en démo publique.

Chaque US devient une issue GitHub, à partir de ce fichier (label `epic:Ex`, milestone `v0.1`). Les comportements sont précisés avec Kim par des exemples métier (BDD), puis leurs scénarios Gherkin sont validés avec le plan et deviennent des tests d'acceptation. Les nouveaux comportements et corrections sont implémentés en TDD : test en échec, code qui passe, puis refactorisation pour la lisibilité. La portée, les vérifications adaptées, la Definition of Ready et la Definition of Done sont celles d'`AGENTS.md`.

Certaines stories indiquent des **patterns envisagés** (règle « Design patterns : usage pertinent » d'`AGENTS.md`, décision du 2026-11-05). Ce sont des pistes liées à un besoin précis : le plan de la story les confirme ou les écarte. Une optimisation n'est retenue que mesurée, coût initial et gain compris.

## Priorisation

Priorité MoSCoW : **M** indispensable à la démo · **S** important, peut suivre la démo · **C** si le temps le permet.

### Phase 1 — d'ici janvier 2027 (sessions longues : socle et infrastructure)

| Ordre | US  | Titre                                                              | Priorité |
| ----- | --- | ------------------------------------------------------------------ | -------- |
| 1     | 001 | Sécuriser le VPS                                                   | ✅       |
| 2     | 013 | Durcissement : compléments des revues                              | M        |
| 3     | 002 | Initialiser le monorepo (PR 1 : squelette et outillage)            | ✅       |
| 4     | 003 | CI de base (avancée avant US-030)                                  | ✅       |
| 5     | 030 | Module de référence `organization`, PR A : sites et créneaux types | ✅       |
| 6     | 030 | Module de référence `organization`, PR B : compétences et postes   | ✅       |
| 7     | 004 | Environnement local                                                | ✅       |
| 8     | 020 | Connexion OIDC et rôles, PR A : jetons côté API et Keycloak local  | ✅       |
| 9     | 009 | Walking skeleton : chaîne back locale (A)                          | M        |
| 10    | 012 | Maquettes des écrans clés                                          | M        |
| 11    | 010 | Tokens de marque                                                   | M        |
| 12    | 011 | Composants de base                                                 | M        |
| 13    | 020 | Connexion OIDC et rôles, PR B : connexion dans le front            | M        |
| 14    | 009 | Front minimal : bouton, progression et résultat (B, partie locale) | M        |
| 15    | 005 | Déploiement staging et prod (prod fermée au public)                | M        |
| 16    | 008 | Sauvegardes, avec test de restauration                             | M        |
| 17    | 009 | Preuve de la chaîne complète déployée (B, logs et sondes)          | M        |
| 18    | 030 | Module de référence `organization`, PR C : page Angular et E2E     | M        |
| 19    | 006 | Site de documentation                                              | S        |

**Ordre validé le 5 novembre 2026** : terminer A3, préparer la maquette et le front minimal (connexion, bouton « Tester le moteur », progression et résultat), puis déployer la chaîne complète en staging avec sauvegardes et observabilité. Seules les parties d’US-012, US-010 et US-011 nécessaires à la connexion et au diagnostic précèdent ce front minimal ; les autres maquettes et composants seront réalisés avec leurs écrans. La grille de planning n’est pas nécessaire pour cette première démonstration.

**Ordre révisé le 6 novembre 2026**, sur la recommandation de Claude et de Codex après la relecture de structure (AGENTS.md, « Mesure dans l'infrastructure ») :

- terminer le staging (US-005), puis les sauvegardes avec un test de restauration (US-008) ;
- faire la preuve déployée (US-009 B) avec les logs structurés et les sondes existants ;
- passer ensuite au métier, sans attendre janvier.

La stack Grafana complète (US-007) est reportée avant l'ouverture de la démo publique (US-092), et US-009 B n'en dépend plus.

**Ordre révisé le 15 novembre 2026**, décidé par Kim sur la recommandation de Claude, une fois le staging en service. La recherche de stage a commencé : la démo doit montrer le cœur métier au plus tôt. Le chemin vers la démo passe par une tranche verticale, en trois jalons. Les stories et leurs règles ne changent pas. Seul leur ordre change, et chaque story de gestion est coupée en deux : le modèle et sa persistance d'abord, l'écran ensuite.

1. **Jalon 1 — Générer et voir** ([#69](https://github.com/hachwilliam89-spec/trame/issues/69)) : un jeu de démo réduit, le modèle des employés, des contrats et des besoins, un premier jeu de règles dans le moteur, le lancement d'une génération et la grille en lecture seule, avec la couverture chiffrée. Premières parties d'US-031, 032, 050, 040, 061, 060, 062, 071 et 090.
2. **Jalon 2 — Absence, ajustement, réparation, publication** (ordre révisé le 18 novembre 2026, voir plus bas) : le parcours d'une absence de dernière minute, jusqu'au planning publié, puis l'équipe de nuit.
3. **Jalon 3 — Ouvrir** : une organisation par visiteur (US-021, US-090), les sauvegardes avec test de restauration (US-008), puis la protection et l'ouverture (US-092).

Deux écarts par rapport à l'ordre du 6 novembre :

- les sauvegardes (US-008) passent du début du métier à l'avant-ouverture, le staging ne portant que des données fictives ;
- les écrans de gestion (US-031 à US-050) et la vue employé viennent après les jalons. Depuis la révision du 18 novembre, la saisie minimale des absences (US-033) et la publication (US-080) en sortent : elles font partie du jalon 2.

**Ordre révisé le 18 novembre 2026**, décidé par Kim. La maquette « Trame — planning moderne » (thèmes clair et sombre, mobile) raconte une absence de dernière minute, son ajustement, sa réparation, puis la publication. Le jalon 2 suit ce parcours avant l'équipe de nuit, en six capacités :

1. les absences, saisies par le manager et prises en compte dans une génération (US-033) ;
2. le brouillon, la version de référence et la gestion des modifications concurrentes (US-073). Il précède toute modification : il fixe où elles sont enregistrées et comment on les annule ;
3. la PE et la modification manuelle évaluée, avec ses motifs de refus (US-070, US-072) ;
4. la réparation automatique, avec des changements limités (US-074) ;
5. la publication et l'historique des versions (US-080) ;
6. l'équipe de nuit et les règles du travail de nuit (US-061). La nuit fait partie du métier d'un entrepôt, mais ses règles, dont le statut de travailleur de nuit calculé, se livrent entières : d'ici là, le planning reste en 2×8 de jour.

Chaque capacité est livrée côté back, puis son écran s'intègre aussitôt dans le front, par petites tranches utilisables : pas de grande intégration finale, et chaque contrat est vite confronté à l'écran qui l'utilise. La maquette précise les besoins, elle ne fige pas les règles métier : les contrats restent versionnés (ADR-0018). L'explication fine d'un manque (pourquoi aucun candidat ne peut le combler) reste en v0.3 : le jalon 2 affiche le manque chiffré d'US-062.

Garde-fous : chaque contexte suit le module de référence, les données de démo passent par les use cases, et chaque règle est une classe unique avec son test de cohérence (ADR-0020).

### Phase 2 — pendant le stage (sessions courtes : une story = un déploiement)

| Ordre | US  | Titre                                        | Priorité |
| ----- | --- | -------------------------------------------- | -------- |
| 20    | 031 | Employés                                     | M        |
| 21    | 032 | Contrats                                     | M        |
| 22    | 033 | Indisponibilités et absences                 | M        |
| 23    | 040 | Catalogue des règles légales                 | M        |
| 24    | 050 | Besoins de couverture                        | M        |
| 25    | 064 | Spike CP-SAT                                 | M        |
| 26    | 061 | Modèle CP-SAT v1                             | M        |
| 27    | 060 | Lancer une génération                        | M        |
| 28    | 062 | Score et explication de base                 | M        |
| 29    | 073 | Brouillon et version de référence            | M        |
| 30    | 070 | PE synchrone                                 | M        |
| 31    | 071 | Grille de planning                           | M        |
| 32    | 072 | Drag & drop avec PE                          | M        |
| 33    | 074 | Réparer un planning après une absence        | M        |
| 34    | 080 | Publier un planning                          | M        |
| 35    | 021 | Comptes démo (une organisation par visiteur) | M        |
| 36    | 090 | Données de démo                              | M        |
| 37    | 007 | Observabilité de base et alertes             | S        |
| 38    | 092 | Protection et ouverture de la démo publique  | M        |
| 39    | 093 | Licence, sécurité et mentions légales        | M        |
| 40    | 091 | README vitrine et vidéo                      | M        |
| 41    | 014 | Quality gate et tests de mutation            | S        |
| 42    | 041 | Pondération des règles souples               | S        |
| 43    | 081 | Consultation par l'employé                   | S        |

Les stories M, prises dans cet ordre, forment le **chemin critique vers la démo publique**. La démo est datée quelques semaines avant la recherche d'entreprise.

Plusieurs stories n'ont encore qu'une liste de besoins (031, 032, 040, 050, 071, 080…). Elles reçoivent leurs critères Gherkin avant de démarrer : c'est la Definition of Ready.

### Exploration transverse — Jev et l'assistant v0.4

Kim a autorisé le 4 novembre 2026 un prototype Jev comme pilote d'agent : observer une
situation, choisir une action, utiliser un outil, puis proposer une réponse ou demander
une précision. Premier cas : le remplacement après absence, sur données fictives.

- [Protocole, plan et scénarios BDD validés](experiments/jev.md).
- [Issue de suivi #24](https://github.com/hachwilliam89-spec/trame/issues/24).
- [ADR-0031](adr/0031-experimenter-jev-pour-les-decisions-de-l-agent.md), statut Proposé.
- Premier banc sur outils simulés possible avant la v0.4, sans dépendre des stories
  personnel/planning encore à livrer ; les résultats indiquent ces limites.
- Plan et scénarios validés le 4 novembre 2026, puis implémentation en TDD par étapes.
  Première étape : [banc hors ligne, issue #26](https://github.com/hachwilliam89-spec/trame/issues/26).
  Les budgets et critères chiffrés restent à fixer avant la campagne payante.
- Décision d'intégration après comparaison avec une procédure déterministe et un LLM,
  avec les mêmes cas, outils, droits et mesures de qualité, de latence et de coût.
- Aucun changement de priorité des stories v0.1 ni remplacement de CP-SAT ou de la PE.

---

### Améliorations notées

Améliorations d'infrastructure et d'outillage repérées, mais non exigées par une story en cours (AGENTS.md, « Mesure dans l'infrastructure »). Chacune attend un besoin qui la justifie, ou une décision de Kim.

| Amélioration                                                                                             | Origine      | Déclencheur               |
| -------------------------------------------------------------------------------------------------------- | ------------ | ------------------------- |
| Réexaminer la non-journalisation des mots de passe du provisionnement si `pg_stat_statements` est chargé | Revue de #49 | Chargement de l'extension |

Réalisée : les navigateurs de la CI tournent dans l'image officielle de Playwright, épinglée par digest, sans installation apt (#55, après un troisième job annulé le 6 novembre).

## E0 — Socle et infrastructure

### US-001 — Sécuriser le VPS ✅

_En tant qu'exploitant, je veux un serveur durci, afin de pouvoir exposer la démo publiquement sans risque évitable._

> **Terminée le 2026-11-01.** Scripts dans le dépôt `vps-edge`, dossier `host/` : `hardening.sh` (idempotent), `check.sh` (contrôle depuis le VPS) et `check-externe.sh` (ports et SSH vus de l'extérieur). SSH est en `LIMIT IN` dans UFW. Les services existants sont inventoriés dans le cadrage, §12.
> Les compléments issus de l'audit et de la revue croisée sont suivis dans US-013.

```gherkin
Scénario: Accès SSH
  Étant donné le VPS configuré
  Quand je me connecte en SSH avec un mot de passe ou en root
  Alors la connexion est refusée
  Et une connexion par clé avec l'utilisateur autorisé réussit

Scénario: Surface réseau
  Quand je scanne les ports publics
  Alors seuls 22, 80 et 443 sont ouverts
```

### US-013 — Durcissement : compléments des revues

> Scripts écrits le 2026-11-01 dans `vps-edge/host/`. **État constaté sur le VPS dans la nuit du 14 au 15 novembre 2026** : `host/check.sh` passe ses treize contrôles, les logs sont plafonnés et les conteneurs d'Équilibre sont sous Compose ; le contrôle externe complet (`check-externe.sh --complet`) n'a pas été rejoué à cette occasion. Précontrôle SSH du 5 novembre : huit conteneurs avec `json-file` sans plafonds, deux conteneurs web Équilibre sans projet Compose ; voir [le constat daté](deploiement.md#précontrôle-du-vps).

- Logs Docker plafonnés par Docker seul (`daemon.json`, avec `live-restore`), sans outil externe sur ses fichiers. Puis Docker est redémarré et les conteneurs recréés.
- `equilibre-web` et `equilibre-telechargements`, lancés hors compose, sont repris dans un fichier compose avant toute recréation :
  - configuration reconstituée depuis `docker inspect` : image, commande, variables, volumes, réseaux et alias, politique de redémarrage ;
  - comparée à l'existante avant la bascule, puis vérifiée par `scripts/check.sh` (routes d'Équilibre inchangées).
- `check.sh` vérifie aussi que seul Traefik publie des ports et que chaque conteneur a des logs plafonnés.
- `check-externe.sh` échoue au moindre écart avec l'attendu. Son mode `--complet` balaie les 65 535 ports avec nmap.

```gherkin
Scénario: Port publié par erreur
  Étant donné un conteneur, autre que Traefik, qui publie le port 8080
  Quand je lance check.sh
  Alors le contrôle échoue et nomme le conteneur

Scénario: Authentification par mot de passe réactivée
  Étant donné un serveur qui accepte de nouveau les mots de passe
  Quand je lance check-externe.sh
  Alors le contrôle échoue avec un code de sortie non nul
```

### US-002 — Initialiser le monorepo

Livrée en deux PR : le squelette et l'outillage (PR 1), puis le module de référence `organization` (PR 2 = US-030).

PR 1 :

- Dépôt `trame` public sur GitHub (ADR-0017), avec `LICENSE` (MIT) et `SECURITY.md` dès le premier commit.
- Versions épinglées (cadrage §11) : Node 26, pnpm 12, Nx 24, Angular 22.2, TypeScript 6.0, NestJS 12, Prisma 7.10, zod 4, Python 3.14, OR-Tools 9.15, FastAPI, uv.
- Apps `api`, `web`, `engine` et `docs`. Libs `shared/contracts` et `platform/*` (ADR-0026).
- TypeScript strict, ESLint (règles `@nx/enforce-module-boundaries` avec tags `scope:*`, dont `scope:platform`, et `layer:domain|application|infrastructure`, interdiction de `new Date()` hors de l'adaptateur d'horloge), Prettier, Knip, lefthook, commitlint.
- Moteur : Ruff, mypy strict, import-linter, `pydantic-settings`, `structlog`, endpoint `/health`, une résolution CP-SAT minimale testée.
- Pipeline des contrats : export JSON Schema depuis zod, génération des modèles Pydantic (`contracts:generate`). Un test exporte tous les schémas, limités aux constructions exportables.
- Prisma 7 avec son adaptateur `@prisma/adapter-pg`, et un test de connexion.
- Socle API : Vitest avec SWC, `/api/v1`, filtre d'erreurs RFC 9457, `ZodValidationPipe`, `nestjs-pino`, configuration validée par zod, `@nestjs/terminus`, `X-Powered-By` masqué, port `Clock`.
- Ce socle est rangé dans `libs/platform/` (`clock`, `problem-details`, `zod-validation`, `config`, `logging`, `health`), chaque lib avec son README. Les libs `platform` `outbox`, `inbox` et `messaging` sont livrées avec US-009 A2 (#33) ; l’idempotence du diagnostic est livrée avec A1 (#31). `audit` reste prévue avec US-040. `auth`, `ids` et `pagination` sont arrivées avec US-030 ; le résolveur OIDC et Keycloak local sont livrés avec US-020 A (#22 et #28).
- Socle web : Angular zoneless, Tailwind, Vitest.
- Les commandes d'`AGENTS.md` sont figées et vérifiées.

### US-003 — CI de base ✅

> **Terminée le 2026-11-02 (#2).** Compléments du même jour : règles de lisibilité vérifiées par la lint (#6), audit bloquant des workflows par zizmor, et soumission des dépendances au graphe de GitHub, vérifiée sur `main` (#8, ADR-0029). `dependency-review-action` reste à ajouter, avec une politique de licences explicite.

```gherkin
Scénario: PR non conforme
  Étant donné une PR qui viole une frontière d'architecture
  Quand la CI s'exécute
  Alors le job lint échoue
  Et la PR ne peut pas être mergée

Scénario: Contrat désynchronisé
  Étant donné une PR qui modifie un schéma zod sans régénérer les modèles Pydantic
  Quand la CI s'exécute
  Alors le job contrats échoue
```

Jobs de base, qui protègent le code présent dès le départ :

- lint, typecheck, Knip, tests unitaires et d'intégration (Testcontainers), build, tous en `nx affected` ;
- vérification des contrats générés ;
- sécurité : CodeQL, gitleaks, audit des dépendances ;
- Renovate, protection de `main`, template de PR avec la DoR et la DoD.

Les autres contrôles arrivent avec le risque qu'ils couvrent :

- E2E Playwright (Chromium, Firefox, WebKit) avec la première page, dans la PR C d'US-030 ;
- scan d'images, SBOM et signature avec le déploiement, dans US-005 ;
- OWASP ZAP avec l'ouverture publique, dans US-092 ;
- quality gate SonarCloud et Stryker quand le domaine a du contenu, dans US-014.

### US-004 — Environnement local ✅

> **Terminée le 2026-11-03 (#17).** Issue #13, scénarios validés le 2026-11-03. Keycloak, l'import du realm et les comptes locaux passent dans US-020 : rien ne s'en sert avant.

- `infra/compose/dev.yml` : PostgreSQL et RabbitMQ (avec l'interface de management), images figées par version et digest, suivies par Renovate.
- Healthchecks, ports publiés sur `127.0.0.1` uniquement, volumes nommés. L'API écoute sur `HOST`, `127.0.0.1` par défaut.
- `pnpm nx run infra:up` (démarrage sain puis migrations), `infra:down` (données conservées), `infra:reset` (volumes supprimés).
- `.env.example` complet. Le README démarre en 4 commandes.

### US-005 — Déploiement staging et prod

> Cadrage dans [#39](https://github.com/hachwilliam89-spec/trame/issues/39) et [docs/deploiement.md](deploiement.md). Première tranche : images et preuve locale/CI ([#40](https://github.com/hachwilliam89-spec/trame/issues/40)), scénarios et plan validés par Kim le 5 novembre 2026 ; livrée par [#42](https://github.com/hachwilliam89-spec/trame/pull/42). Publication des images (B1, [#44](https://github.com/hachwilliam89-spec/trame/issues/44)) livrée le 6 novembre 2026 par [#45](https://github.com/hachwilliam89-spec/trame/pull/45) : images scannées, avec SBOM et provenance, signées sans clé pour leur commit, et un manifeste de version signé. Reste le staging (B2), après US-013, qui reste préalable à la mise en service. Livraison continue révisée le 16 novembre 2026 (ADR-0035) : déploiement à la demande, répété sur le commit visé puis approuvé, plutôt qu'à chaque fusion.

```gherkin
Scénario: Livraison continue sur staging
  Quand une PR est mergée sur main
  Alors les images sont construites, scannées (Trivy), signées (cosign) et poussées sur GHCR
  Quand Kim lance le déploiement d'un commit de main et l'approuve après sa répétition
  Alors staging est redéployé avec les migrations appliquées
  Et le déploiement échoue si un healthcheck ne passe pas dans les 60 s

Scénario: Release en production
  Quand un tag vX.Y.Z est créé par semantic-release
  Alors la prod est déployée avec la même image que staging

Scénario: Retour arrière après migration
  Étant donné une release dont la migration a été appliquée sur staging
  Quand je redéploie l'image précédente sur staging
  Alors l'API précédente fonctionne sur le schéma migré
```

Inclus :

- routes déclarées par labels sur le réseau `edge` du Traefik mutualisé (ADR-0016), routeurs préfixés `trame-` ;
- **production fermée au public** (authentification au niveau de Traefik) jusqu'à US-020 et US-092 ;
- infra partagée entre staging et prod (bases, vhosts et realms séparés) ;
- limites CPU et mémoire par conteneur : moteur prod à 4 CPU et 1,5 Gio, moteur staging à 1 CPU et 0,5 Gio, une résolution à la fois par environnement ;
- scan des images (Trivy), SBOM et signature (cosign) ;
- CSP du front écrite à la main, et CSP dédiée pour la page Scalar (ADR-0024).

### US-006 — Site de documentation (S)

- Astro Starlight déployé sur `docs.`, avec :
  - la structure arc42 ;
  - le diagramme de contexte C4 et le diagramme de conteneurs ;
  - les ADR (une par fichier) ;
  - les diagrammes PlantUML et Mermaid rendus ;
  - les formules KaTeX.
- La référence OpenAPI est générée depuis l'API (Scalar).
- Page « Comment ce projet est développé ».

### US-007 — Observabilité de base et alertes (S)

> **Reportée le 6 novembre 2026** avant l'ouverture de la démo publique (US-092) : le métier passe d'abord. Les logs structurés et les sondes existants suffisent au staging.

- OpenTelemetry dans l'API et le moteur. Une trace relie la requête HTTP, le message RabbitMQ et la résolution.
- Prometheus, Loki, Tempo et Grafana avec des rétentions bornées. Un dashboard « Santé » : latence, erreurs, durée des résolutions, files.
- Objectifs de service : disponibilité de 99 % sur 30 jours, PE p95 < 200 ms, résolution hebdomadaire < 30 s. Alertes Grafana par e-mail.
- Uptime Kuma sur `status.`, en page publique.
- Pattern envisagé : **Décorateur** autour des ports (traces OTel, puis réessais du publieur AMQP), pour ajouter ces préoccupations transverses sans modifier les adaptateurs.

### US-008 — Sauvegardes

```gherkin
Scénario: Restauration
  Étant donné la sauvegarde chiffrée de la nuit, stockée hors du serveur
  Quand je lance le script de restauration sur une base vide
  Alors les données sont restaurées
  Et le test de restauration est documenté avec sa date
```

- Objectifs : perte de données maximale de 24 h (RPO), remise en service en 2 h (RTO). Procédure documentée.

### US-009 — Walking skeleton

> **Découpage validé le 2026-11-04**, suivi dans [#29](https://github.com/hachwilliam89-spec/trame/issues/29).
> US-020 A est livrée (#22 et #28). La chaîne back locale et CI (A) précède US-005 ;
> le front minimal (B, partie locale) suit A3 et US-020 B (après les maquettes US-012),
> puis la preuve déployée (B) suit US-005 et US-008 (ordre révisé le 6 novembre : US-007 est reportée).
> US-009 reste ouverte jusqu'à la preuve B ci-dessous.

- **A1 — Livrée, #30 et #31** : diagnostic authentifié, idempotence par organisation,
  job et message outbox atomiques. Consultation filtrée ; calcul fixe côté serveur,
  aucune entrée de calcul arbitraire. Le job est conservé en attente jusqu’au lancement du transport et du worker.
- **A2 — Livrée, #32 et #33** : relais RabbitMQ avec confirmations, worker Python réel, résultat
  via inbox atomique, redélivraisons, reprises bornées et file d'erreurs. Le worker
  reste sans accès à la base ; un recalcul après panne est possible, sans second résultat visible.
- **A3 — Livrée, #35 et #36** : progression SSE persistée et ordonnée, reprise `Last-Event-ID`,
  conservation 1 h après fin, keepalive 20 s, jeton Bearer hors URL et fermeture à expiration,
  test d'acceptation réel et corrélation entre les composants.
- **B — Partie locale livrée (#37 et #38), preuve déployée à faire** : bouton authentifié, progression et résultat dans Angular
  en local après A3 et US-020 B ; puis chaîne complète déployée et sauvegardée, après US-005 et
  US-008. La corrélation passe par les logs structurés et le `runId` ; la trace dans Grafana
  arrivera avec US-007.

```gherkin
Scénario: Aller-retour complet
  Étant donné l'application déployée
  Quand je clique sur « Tester le moteur » dans le front
  Alors l'API écrit un événement dans l'outbox
  Et le moteur reçoit le job via RabbitMQ et résout un problème CP-SAT trivial
  Et l'API enregistre le résultat via l'inbox
  Et le front affiche la progression (SSE) puis le résultat
  Et les logs structurés de l'API, du relais et du moteur se relient par le même runId
```

> **Décidé le 2026-11-03** : les routes métier répondent 401 tant qu'OIDC n'est pas branché. US-020 passe donc avant US-009, côté API (PR A, #21) : le parcours du walking skeleton se déclenche avec un vrai jeton, sur un endpoint protégé, sans contournement à retirer.

---

## E1 — Design system

### US-012 — Maquettes des écrans clés

> Première tranche validée le 5 novembre 2026 : version **Guidé**, connexion et diagnostic, états de progression et résultat, reprise/expiration. Les autres écrans restent à maquetter.
>
> Grille de planning maquettée le 18 novembre 2026 dans Claude : « Trame — planning moderne », en thèmes clair et sombre, et sur mobile. Elle sert de référence à US-071 et aux écrans du jalon 2.

- Maquettes Figma de : la grille de planning, la génération avec sa progression, l'explication d'un planning, les trois états de la PE pendant un drag & drop, la vue employé (PWA).
- Elles fixent la direction visuelle (palette Trame, typographie, densité) et alimentent les tokens d'US-010.
- Validées par Kim avant US-071. C'est la Definition of Ready des stories d'interface.

### US-010 — Tokens de marque

> Première tranche livrée dans #38 : palette clair/sombre et logo original pour le diagnostic, tokens dans `libs/web/brand`. Manifest et autres besoins de marque restent à compléter.

- Kit logo intégré (favicon, manifest, icônes).
- Tokens CSS (couleurs clair/sombre issues de la palette Trame, typographie, espacements, rayons, ombres), plus la configuration Tailwind.
- Tokens de marque séparés des composants, qui ne lisent que des variables CSS (ADR-0026).
- Mode sombre dès la v0.1. Accessibilité RGAA (WCAG 2.2 AA) vérifiée par axe dans Playwright.
- Budgets Lighthouse (LCP < 2,5 s) et budgets de taille de bundle Angular.

### US-011 — Composants de base

- Bouton, champ, select, tableau, modale, toast, badge de statut PE (RÉALISABLE / IRRÉALISABLE / INCERTAIN).
- Basés sur Angular CDK : accessibles au clavier, avec les bons attributs ARIA.
- Catalogue Storybook déployé avec la doc (C).

---

## E2 — Identité et accès

### US-020 — Connexion OIDC et rôles

> API A1 et A2 livrées dans les PR #22 et #28 (Keycloak local et parcours réel PKCE).
> Le front de connexion (PR B) est livré avec le premier parcours Guidé (#37 et #38), après validation de sa maquette par Kim le 5 novembre 2026.

```gherkin
Scénario: Accès selon le rôle
  Étant donné un utilisateur avec le rôle "employé"
  Quand il appelle l'endpoint de génération de planning
  Alors il reçoit une réponse 403 au format problem+json
  Et la tentative est journalisée
```

```gherkin
Scénario: Accès à l'objet d'un autre
  Étant donné deux employés A et B de la même organisation
  Quand A demande le planning de B
  Alors il reçoit une réponse 404
```

- Flux Authorization Code + PKCE par redirection (pas de popup) côté front.
- Validation des JWT côté API, avec des guards par rôle (`manager`, `employe`, `admin`).
- L'`organizationId` de l'utilisateur vient du jeton et filtre toutes les requêtes. La propriété de chaque objet est vérifiée en plus (ADR-0022).
- Keycloak rejoint la stack de dev (décision du 2026-11-03, US-004) : service Compose dans `infra/compose/dev.yml`, import du realm versionné (`infra/keycloak/`), comptes locaux pour chaque rôle.

Livrée en deux PR (décision du 2026-11-03) :

- **PR A** (#21) : l'API vérifie les jetons (ADR-0030), et Keycloak rejoint la stack de dev. Deux étapes : A1, le résolveur OIDC testé avec des jetons signés localement ; A2, Keycloak, le realm, la protection de l'organisation et des rôles, et le parcours Authorization Code + PKCE dans un navigateur automatisé.
- **PR B** : la connexion dans le front, après les maquettes d'US-012.

Le scénario « accès à l'objet d'un autre » ci-dessus suppose des employés et des plannings : il passe dans les stories `staff` et `scheduling`.

### US-021 — Comptes démo (une organisation par visiteur)

- Boutons « Entrer en manager » et « Entrer en employé » sur la page d'accueil de la démo.
- Chaque entrée crée une organisation de démo dédiée, copiée du jeu de démo, purgée après 24 h (ADR-0025). Aucun droit admin.

```gherkin
Scénario: Isolation entre visiteurs
  Étant donné deux visiteurs entrés en manager
  Quand le premier modifie et publie un planning
  Alors le second ne voit ni la modification ni le job du premier

Scénario: Purge
  Étant donné une organisation de démo créée il y a plus de 24 h
  Quand le job de purge passe
  Alors l'organisation et toutes ses données sont supprimées
```

---

## E3 — Organisation et personnel

### US-030 — Sites, postes, compétences et créneaux (module de référence)

_En tant qu'admin, je veux décrire un site, ses postes (préparation, réception, cariste…), les compétences requises et les créneaux types, afin que le moteur sache qui peut tenir quel shift, et quand._

Règles métier :

- un code de site est unique dans l'organisation ;
- un site porte un fuseau IANA (`Europe/Paris` par défaut) ;
- un poste ne peut exiger que des compétences qui existent ;
- une compétence utilisée par un poste ne peut pas être supprimée ;
- un créneau type est défini en heure locale du site (ex. nuit 22 h–6 h) et peut traverser minuit ;
- un créneau type a une pause positionnée (durée et heure de début), et son temps effectif est l'amplitude moins la pause.

```gherkin
Scénario: Compétence utilisée
  Étant donné une compétence "CACES R489" exigée par le poste "Cariste"
  Quand l'admin tente de la supprimer
  Alors la suppression est refusée avec une erreur problem+json explicite

Scénario: Créneau de nuit au changement d'heure
  Étant donné un créneau "Nuit" de 22 h à 6 h avec 30 min de pause, sur un site en Europe/Paris
  Quand on calcule ses durées la nuit du passage à l'heure d'hiver
  Alors l'amplitude vaut 9 h
  Et le temps effectif vaut 8 h 30
```

Module de référence : contrats zod, domaine, use cases, repository Prisma (schéma `organization`), contrôleur REST, page Angular de liste et de création, et premier test E2E Playwright sur les trois moteurs. Tests de tous les niveaux, dont un test d'accès croisé par endpoint.

Livrée en trois PR (décision du 2026-11-02, Definition of Ready) :

- **PR A** : sites et créneaux types (fuseau, pause positionnée, nuit du changement d'heure).
- **PR B** : compétences et postes (compétence utilisée).
- **PR C** : page Angular de liste et de création, et premier E2E Playwright, après les maquettes d'US-012.

Depuis US-020 A (#22 et #28), les routes métier utilisent le résolveur OIDC de `libs/platform/auth` : l'utilisateur, son `organizationId` et ses rôles proviennent du jeton validé. Les tests peuvent injecter un utilisateur de test ; sans jeton valide, les endpoints répondent 401.

> **PR A livrée le 2026-11-02 (#7).** Décisions prises en revue croisée :
>
> - un créneau type a toujours une pause ; le minimum légal de pause (L3121-16) est une contrainte de planning, qui relève du moteur ;
> - le libellé d'un créneau n'est pas unique : son identifiant suffit ;
> - durées : une heure locale désigne le premier instant où l'horloge du site l'affiche, et une heure sautée au passage à l'heure d'été désigne l'instant du saut ;
> - types d'erreur en URI `tag:` (ADR-0028), UUID v7 ordonnés même dans la même milliseconde, clé étrangère composite qui garantit l'organisation d'un créneau.
>
> **PR B livrée le 2026-11-03 (#11)**, scénarios dans l'issue #10. Une compétence exigée par un poste ne peut pas être supprimée : le use case le vérifie, et la clé étrangère `ON DELETE RESTRICT` couvre une suppression concurrente, renvoyée avec la même erreur. La PR corrige aussi deux défauts de la PR A : le caractère NUL, refusé désormais dans tous les textes saisis (contrat `requiredText`), et la date de création, désormais à la milliseconde.

### US-031 — Employés

> **Première partie livrée au jalon 1** ([#69](https://github.com/hachwilliam89-spec/trame/issues/69)) : le modèle de l'employé et de ses habilitations, sa persistance (schéma `staff`), sa lecture par l'API (`GET /api/v1/employees`) et le monteur `anEmployee()`. L'écriture par l'API et l'écran de gestion restent à faire. La validité d'une habilitation à une date est décidée par le moteur seul (règle 5).

- CRUD : compétences, habilitations avec date d'expiration (ex. CACES).
- Pattern envisagé : **Monteur de données de test** (Test Data Builder), exposé par le point d'entrée `testing`. Les scénarios restent lisibles (« un cariste dont le CACES expire le 10 décembre ») sans fixtures longues. Il sert ensuite à `staff`, `demand` et `scheduling`, et son équivalent Python au moteur.

```gherkin
Scénario: Habilitation expirée
  Étant donné un cariste dont le CACES expire le 10 décembre
  Quand je génère le planning de la semaine du 14 décembre
  Alors il n'est affecté à aucun shift qui exige ce CACES
```

### US-032 — Contrats

> **Première partie livrée au jalon 1** ([#69](https://github.com/hachwilliam89-spec/trame/issues/69)) : le volume hebdomadaire minimum et maximum, la période, la règle « un seul contrat actif par employé et par période », la persistance et la lecture par l'API (`GET /api/v1/employees/:employeeId/contracts`). Restent à faire : le type de contrat, les jours travaillables (avec leur règle dans le moteur), l'indicateur « peut travailler de nuit » (avec l'équipe de nuit, jalon 2), l'écriture par l'API et l'écran de gestion.

- Type de contrat, volume horaire hebdomadaire minimum et maximum, jours travaillables, dates de début et de fin, indicateur « peut travailler de nuit ». Le statut de travailleur de nuit, lui, est calculé par le moteur (US-061).
- Un seul contrat actif par employé et par période.

### US-033 — Indisponibilités et absences

> **Livré au jalon 2** ([#105](https://github.com/hachwilliam89-spec/trame/issues/105)) : la saisie des absences par le manager (modèle, persistance, déclaration, modification et suppression par l'API, lecture des absences d'un site sur une semaine), puis leur valorisation figée : la référence de chaque semaine se fige à la déclaration, la durée d'un jour couvert en partie se donne par `PUT /api/v1/employees/:employeeId/absence-days/:date`, et `GET /api/v1/absence-valuations` rend les minutes valorisées de chaque employé avec leur référence. Enfin, la prise en compte par le moteur et la génération : la règle `INDISPONIBILITE` interdit tout créneau qu'une absence chevauche, le volume contractuel part du minimum restant, et chaque génération garde les valorisations utilisées. Reste à faire : la saisie dans l'écran du planning, après sa maquette.

- Saisie par le manager en v0.1 (par l'employé en v0.2) : une période, et un motif par catégorie (congé, arrêt de travail, formation, autre), sans champ libre ni détail médical.
- Indispensable avant la génération : les absences sont une entrée du moteur, et l'absence de dernière minute est au cœur du produit. Première capacité du jalon 2.
- Scénarios, plan et interprétations validés par Kim le 18 novembre 2026 (#105), précisés le 19 novembre après la revue de la PR #111 : la durée d'un jour partiel dépend de sa couverture.
- Une absence enregistrée ne modifie aucune affectation existante ; les générations suivantes en tiennent compte. Son effet sur un planning existant (affectations incompatibles, règles concernées, couverture) est évalué par le moteur avec la PE (US-070). D'ici là, l'écran affiche « Absence enregistrée · planning existant non réévalué », sans présenter le planning comme toujours valide.
- Le manager modifie les dates ou le motif d'une absence, et supprime une absence saisie par erreur.
- Minimum restant de la semaine = max(0, minimum contractuel − minutes d'absence valorisées). C'est une convention du modèle de planification, cadrée pour la démo : ni une règle de paie, ni un décompte légal des absences. Heures planifiées et heures d'absence s'affichent séparément.
- **Avec un planning de référence.** La référence d'un salarié pour une semaine est figée à sa première absence de la semaine : la dernière génération réussie à cet instant, avec ses affectations et leurs pauses. Aucune génération ne la change ensuite ; le planning publié deviendra la référence prioritaire (US-080). Les minutes valorisées sont le temps de ces affectations couvert par l'union des absences actives, pauses effectivement recouvertes retranchées, sans prorata. Un repos ne réduit rien, et chaque minute ne compte qu'une fois : supprimer une absence ne retire pas les minutes qu'une autre couvre encore.
- **Sans planning de référence.** Convention de démonstration « parts égales sur les jours d'activité », nommée dans le résultat avec ses paramètres. Part journalière = minimum contractuel ÷ jours où le site a des besoins dans la semaine, figée à la déclaration. Un jour entier d'absence vaut sa part ; un jour couvert en partie demande une durée explicite, par salarié et par jour, plafonnée à la part. Elle ne se donne qu'à un jour qu'une absence couvre en partie, et vaut pour la couverture du jour à la saisie : si les absences de ce jour la changent, la durée est redemandée. Des absences remaniées qui couvrent le jour de la même façon la gardent, tant que le jour n'est jamais resté sans absence : la suppression ou la modification qui laisse un jour vide efface sa durée dans la même transaction.
- **Valorisation « à définir ».** Semaine sans jour d'activité, ou jour partiel sans durée : la valorisation est signalée « à définir », et retentée à chaque saisie ou modification d'une absence du salarié dans la semaine. L'absence reste enregistrée. À la génération, un salarié dont un jour partiel attend sa durée est exclu de la semaine avec le motif `ABSENCE_VALUATION_TO_DEFINE`, au lieu d'un minimum gardé entier ou levé en silence. Une semaine sans jour d'activité n'a pas de besoin : son lancement est refusé, et dès que des besoins existent, la référence se fige au lancement. La répartition contractuelle viendra avec les jours travaillables d'US-032.
- **À la génération.** Les références encore « à définir » sont retentées au lancement, pour la seule semaine générée. Absences et valorisations sont ensuite lues dans un même état cohérent. Le problème envoyé au moteur porte, pour chaque salarié, ses minutes d'absence valorisées et ses indisponibilités : les absences qui chevauchent un créneau du problème, sans être bornées à la semaine (un créneau de nuit du dimanche peut finir le lundi suivant). La génération garde les valorisations utilisées et leur calcul.
- Les instants sont stockés en UTC et lus dans le fuseau du site (ADR-0019). Une absence se saisit à la minute (secondes à zéro, sans fraction) : c'est la précision des créneaux et des minutes valorisées, et rien n'est tronqué au stockage. La fin est exclue : une journée entière d'absence va de minuit à minuit le lendemain, et une absence couvre un créneau dès qu'elle en chevauche une partie.

Données : semaine du lundi 23 novembre 2026, entrepôt de démonstration (Europe/Paris), besoins du lundi au samedi. Créneau du matin 6 h – 13 h 20, pause 10 h – 10 h 20 (7 h effectives). Créneau de l'après-midi 13 h 30 – 20 h 50, pause 17 h – 17 h 20. Camille Laurent et Yanis Morel à temps plein, minimum 28 h ; Inès Fabre à temps partiel, minimum 14 h.

#### Saisie

```gherkin
Scénario: Une absence retire le salarié des créneaux qu'elle couvre
  Étant donné Inès Fabre, cariste, absente du mardi 24 au mercredi 25 novembre pour un congé
  Quand le manager lance la génération de la semaine du 23 novembre
  Alors aucun créneau du mardi 24 ni du mercredi 25 ne lui est affecté
  Et ses cases de ces deux jours indiquent l'absence

Scénario: Absence sur une partie de la journée
  Étant donné Yanis Morel absent le jeudi 26 novembre de 6 h à 10 h
  Quand le manager lance la génération de la semaine
  Alors le créneau du matin (6 h – 13 h 20) du jeudi ne lui est pas affecté
  Et le créneau de l'après-midi (13 h 30 – 20 h 50) du jeudi reste possible

Scénario: Motif par catégorie, sans détail médical
  Quand le manager saisit une absence
  Alors il choisit son motif parmi des catégories : congé, arrêt de travail, formation, autre
  Et aucun champ libre ne permet d'y ajouter un détail médical

Scénario: Période incohérente refusée
  Quand le manager saisit une absence dont la fin précède le début
  Alors la saisie est refusée avec le motif « la fin doit suivre le début »

Scénario: Absence déclarée après la génération
  Étant donné un planning de la semaine du 23 novembre où Camille Laurent tient le samedi 28 au matin
  Quand le manager déclare Camille Laurent absente le samedi 28
  Alors l'absence est enregistrée avec la mention « planning existant non réévalué »
  Et aucune affectation du planning existant n'est modifiée
  Et la génération suivante de la semaine ne lui affecte pas le samedi 28

Scénario: Supprimer une absence saisie par erreur
  Étant donné Inès Fabre déclarée absente le mardi 24 par erreur
  Quand le manager supprime cette absence
  Alors la génération suivante peut de nouveau lui affecter le mardi 24

Scénario: Absence d'une autre organisation
  Étant donné un manager d'une autre organisation
  Quand il lit, saisit, modifie ou supprime une absence d'Inès Fabre
  Alors l'API répond 404
```

#### Valorisation avec un planning de référence

```gherkin
Contexte:
  Étant donné une génération réussie de la semaine du 23 novembre
  Et dans ce planning, Camille Laurent travaille le matin du lundi au jeudi (4 × 7 h = 28 h)
  Et se repose le vendredi et le samedi
  Et cette génération est la dernière réussie quand sa première absence de la semaine est déclarée

Scénario: Journée prévue travaillée
  Quand le manager la déclare absente le mardi 24
  Alors 7 h d'absence sont valorisées
  Et son minimum restant de la semaine est de 21 h

Scénario: Absence sur un jour de repos
  Quand le manager la déclare absente le vendredi 27
  Alors aucune heure d'absence n'est valorisée
  Et son minimum restant reste de 28 h

Scénario: Semaine entière
  Quand le manager la déclare absente du lundi 23 au dimanche 29
  Alors 28 h d'absence sont valorisées
  Et son minimum restant est de 0 h

Scénario: Absence partielle hors pause
  Quand le manager la déclare absente le mercredi 25 de 6 h à 10 h
  Alors 4 h d'absence sont valorisées

Scénario: Absence partielle qui recouvre la pause
  Quand le manager la déclare absente le mercredi 25 de 6 h à 11 h
  Alors 4 h 40 d'absence sont valorisées, la pause de 10 h à 10 h 20 retranchée

Scénario: Absences qui se chevauchent
  Étant donné Camille Laurent en congé le mardi 24
  Quand le manager la déclare aussi en arrêt de travail du mardi 24 au mercredi 25
  Alors 14 h d'absence sont valorisées, le mardi n'étant compté qu'une fois

Scénario: Supprimer une absence chevauchée
  Étant donné Camille Laurent en congé le mardi 24, et en arrêt de travail du mardi 24 au mercredi 25
  Quand le manager supprime le congé
  Alors 14 h d'absence restent valorisées, l'arrêt couvrant toujours le mardi

Scénario: Modifier les dates d'une absence
  Étant donné Camille Laurent absente le mardi 24
  Quand le manager déplace cette absence au vendredi 27
  Alors elle est valorisée sur la même référence
  Et aucune heure d'absence n'est valorisée, le vendredi étant un repos

Scénario: Générations répétées
  Étant donné Camille Laurent absente le mardi 24, avec 7 h d'absence valorisées
  Quand le manager relance deux fois la génération de la semaine
  Et qu'aucune de ces générations ne lui affecte le mardi 24
  Alors la référence de sa valorisation reste la génération du contexte
  Et 7 h d'absence restent valorisées

Scénario: Génération terminée après la déclaration
  Étant donné une nouvelle génération de la semaine lancée avant la déclaration de l'absence
  Quand cette génération se termine après la déclaration
  Alors la référence reste la dernière génération réussie au moment de la déclaration
```

#### Valorisation sans planning de référence

```gherkin
Contexte:
  Étant donné aucune génération réussie de la semaine du 23 novembre
  Et des besoins sur six jours, du lundi au samedi

Scénario: Journées entières par convention
  Quand le manager déclare Camille Laurent absente le mardi 24 et le mercredi 25
  Alors la part journalière est de 4 h 40 (28 h ÷ 6 jours d'activité)
  Et 9 h 20 d'absence sont valorisées, son minimum restant étant de 18 h 40
  Et le résultat nomme la convention « parts égales sur les jours d'activité », avec 28 h et 6 jours

Scénario: Semaine entière sans référence
  Quand le manager déclare Camille Laurent absente du lundi 23 au dimanche 29
  Alors son minimum restant de la semaine est de 0 h

Scénario: Absence partielle sans référence
  Quand le manager déclare Camille Laurent absente le jeudi 26 de 6 h à 10 h
  Alors l'absence est enregistrée
  Et la valorisation du jeudi 26 est « à définir », avec une durée à donner d'au plus 4 h 40
  Quand le manager donne une durée de 3 h
  Alors 3 h d'absence sont valorisées

Scénario: Durée valorisée au-delà de la part journalière
  Quand le manager donne une durée de 5 h pour l'absence partielle du jeudi 26
  Alors la durée est refusée avec le motif « au plus la part journalière, 4 h 40 »

Scénario: Durée pour un jour sans absence partielle
  Étant donné Camille Laurent absente le jeudi 26 de 6 h à 10 h
  Quand le manager donne une durée pour le mercredi 25, où elle n'est pas absente
  Alors la durée est refusée : ce jour n'est pas couvert en partie par une absence

Scénario: Absence du jour modifiée après la durée
  Étant donné Camille Laurent absente le jeudi 26 de 14 h à 16 h, valorisée 2 h
  Quand le manager passe l'absence de 14 h à 18 h
  Alors la valorisation du jeudi 26 redevient « à définir »

Scénario: Absence saisie après une suppression, aux mêmes heures
  Étant donné Camille Laurent absente le jeudi 26 de 14 h à 16 h, valorisée 2 h
  Quand le manager supprime cette absence, puis la déclare de nouveau absente de 14 h à 16 h
  Alors la valorisation du jeudi 26 est « à définir », sans reprendre les 2 h

Scénario: Absence déplacée hors du jour, puis ressaisie
  Étant donné Camille Laurent absente le jeudi 26 de 14 h à 16 h, valorisée 2 h
  Quand le manager déplace cette absence au vendredi 27, puis la déclare absente le jeudi de 14 h à 16 h
  Alors la valorisation du jeudi 26 est « à définir », sans reprendre les 2 h

Scénario: Absences remaniées, même couverture du jour
  Étant donné Camille Laurent absente le jeudi 26 de 14 h à 16 h, valorisée 2 h
  Quand le manager ramène l'absence à 14 h – 15 h, puis déclare une absence de 15 h à 16 h
  Alors 2 h d'absence restent valorisées

Scénario: Convention figée
  Étant donné Camille Laurent absente le mardi 24, valorisée sur 6 jours d'activité
  Quand le manager retire les besoins du samedi, puis lance la génération
  Alors la part journalière reste de 4 h 40

Scénario: Semaine sans jour d'activité
  Étant donné aucune génération et aucun besoin pour la semaine du 30 novembre
  Quand le manager déclare Camille Laurent absente le lundi 30
  Alors l'absence est enregistrée, avec une valorisation « à définir » signalée
  Et le lancement d'une génération de cette semaine est refusé faute de besoins, sans compter son absence pour zéro

Scénario: Jour partiel sans durée à la génération
  Étant donné des besoins du lundi 30 novembre au samedi 5 décembre
  Et Camille Laurent absente le lundi 30 de 6 h à 10 h, sans durée donnée
  Quand le manager lance la génération de la semaine du 30 novembre
  Alors Camille Laurent en est exclue avec le motif « durée d'absence à définir »
  Et son minimum n'est ni gardé entier, ni levé en silence

Scénario: Besoins ajoutés après la déclaration
  Étant donné Camille Laurent déclarée absente le lundi 30 novembre, sans besoin ni génération pour cette semaine
  Et des besoins ajoutés ensuite du lundi 30 novembre au samedi 5 décembre
  Quand le manager lance la génération de la semaine du 30 novembre
  Alors la référence se fige à 4 h 40 (28 h ÷ 6 jours d'activité)
  Et le problème transmis au moteur contient un minimum restant de 23 h 20 ainsi que l'indisponibilité du lundi
  Et l'affectation effective dépend ensuite du résultat du moteur
```

---

## E4 — Règles

### US-040 — Catalogue des règles légales

- Les règles v0.1 du cadrage §6 sont seedées avec leurs valeurs par défaut et paramétrables par site : travail de nuit, pause, six jours maximum, repos dominical, délai de prévenance.
- Le repos dominical est actif par défaut. Une dérogation n'est enregistrable qu'avec son fondement juridique (texte et référence).
- Paramètres du travail de nuit par site : période de nuit (21 h–6 h par défaut) et seuil d'heures de nuit (270 h sur 12 mois par défaut).
- Chaque règle a :
  - un identifiant stable (ex. `REPOS_QUOTIDIEN_MIN`), utilisé dans les messages de la PE et de l'infaisabilité ;
  - un libellé ;
  - une référence légale.
- Toute modification d'une valeur est tracée dans un journal d'audit (qui, quand, ancienne et nouvelle valeur).
- Pattern envisagé, côté moteur : **Fabrique** sous forme de registre. L'identifiant et les paramètres reçus de l'API donnent l'instance de la règle, sans `if` par règle. Une règle inconnue est refusée explicitement.

### US-041 — Pondération des règles souples (S)

- Poids réglables par site, avec un préréglage « équilibré ».

---

## E5 — Besoins

### US-050 — Besoins de couverture

> **Première partie livrée au jalon 1** ([#69](https://github.com/hachwilliam89-spec/trame/issues/69)) : les besoins d'une semaine datée (jour, créneau type, poste, nombre requis), leur remplacement en entier, la validation « créneaux et postes du site », la persistance (schéma `demand`) et la lecture par l'API (`GET /api/v1/coverage-needs`). Restent à faire : la copie d'une semaine sur une autre, l'écriture par l'API et l'écran de gestion.

- Grille hebdomadaire : par créneau type et par poste, le nombre de personnes requises.
- Copie d'une semaine sur une autre. Validation (pas de besoin négatif, créneaux du site uniquement).

---

## E6 — Génération

### US-064 — Spike CP-SAT

Prototype jetable, limité à une session, avant US-061. Il mesure :

- le diagnostic d'infaisabilité, avec un seul worker (imposé par OR-Tools) : coût et qualité des explications sur des cas Trame, granularité des littéraux d'hypothèse, taille du sous-ensemble renvoyé, et coût d'une minimisation par suppression ;
- le temps de résolution d'une semaine de 40 employés sur le VPS, avec 1 et 4 workers ;
- l'effet réel des hints sur le temps et sur la stabilité ;
- la mémoire et le CPU consommés pendant une résolution, avec KCD et Équilibre actifs, pour valider le budget du cadrage ;
- le mode déterministe (1 worker) pour les tests ;
- le gain d'un **poids mouche** sur les créneaux types : partager leur partie figée (heures locales, poste, compétences, minutes de nuit d'un jour normal, compatibilité de repos entre deux créneaux types), la date et le fuseau restant propres à chaque shift. Mesures :
  - temps de construction du modèle et pic mémoire (`tracemalloc`), avec et sans partage, sur 40 employés × 1 semaine puis 200 × 4 semaines ;
  - latence d'une évaluation de la PE avec les compatibilités calculées à l'avance ;
  - conditions si le partage est retenu : une nuit de changement d'heure est recalculée à partir des instants réels ; la réserve d'objets partagés vit le temps d'une résolution ou d'une évaluation (moteur sans état), sans rien partager entre organisations.

Livrable : une note technique et une ADR qui fixe les paramètres de résolution, et retient ou écarte le poids mouche d'après ces mesures.

### US-060 — Lancer une génération

```gherkin
Scénario: Génération asynchrone
  Étant donné un site paramétré et ses besoins saisis pour la semaine 50
  Quand le manager lance la génération
  Alors un snapshot du problème est enregistré
  Et la progression s'affiche en temps réel (meilleur score courant, temps écoulé)
  Et le planning proposé s'affiche à la fin, dans la limite de temps configurée

Scénario: Double clic
  Quand le manager lance deux fois la génération avec la même clé d'idempotence
  Alors une seule résolution est exécutée
  Et les deux requêtes renvoient le même job

Scénario: Annulation avec solution
  Étant donné une génération en cours qui a déjà trouvé une solution
  Quand le manager l'annule
  Alors le moteur s'arrête
  Et la meilleure solution trouvée est proposée, marquée comme partielle

Scénario: Annulation sans solution
  Étant donné une génération en cours qui n'a encore trouvé aucune solution
  Quand le manager l'annule
  Alors le job passe à CANCELLED sans planning, et l'interface le dit

Scénario: Délai atteint sans solution
  Quand la limite de temps est atteinte sans aucune solution
  Alors le job passe à UNKNOWN et l'interface propose de relancer avec plus de temps

Scénario: Aucun planning légal
  Étant donné des minimums contractuels impossibles à tenir sur la semaine
  Quand le manager lance la génération
  Alors le job passe à INFEASIBLE avec les familles de règles en conflit
```

- SSE avec message de maintien toutes les 20 s et reprise par `Last-Event-ID`. Événements numérotés, conservés 1 h après la fin du job.
- Pattern envisagé : **Observateur**. Le callback de solution de CP-SAT signale chaque meilleure solution à un observateur, qui publie la progression. Le solveur ignore le transport.
- Cycle de vie du job : une table des transitions autorisées dans le domaine suffit, sans pattern État (une classe par état n'apporterait rien ici).

### US-061 — Modèle CP-SAT v1

- Règles légales et contractuelles (contraintes dures) :
  - habilitation, chevauchement ;
  - repos quotidien de 11 h, 10 h effectives par jour, 48 h par semaine, repos hebdomadaire, six jours maximum, repos dominical ;
  - travailleur de nuit (8 h effectives par nuit), pause positionnée ;
  - volume contractuel, indisponibilités.
- Couverture : objectif pénalisé (variable d'écart) en mode standard, contrainte en mode strict.
- Contraintes souples : équité des week-ends, heures supplémentaires, compacité, stabilité (pénalité par changement).
- Statut de travailleur de nuit calculé : heures de nuit comptées sur la période de nuit du site, historique de 12 mois compris. Les limites s'appliquent dès qu'un critère est atteint, ou le serait par le planning.
- Nuit du passage à l'heure d'hiver : créneau de nuit raccourci d'1 h par défaut, signalé au manager, et l'heure perdue affichée comme manque de couverture.
- Les 7 derniers jours publiés, les compteurs des 12 dernières semaines et le compteur d'heures de nuit des 12 derniers mois sont intégrés comme données figées.

```gherkin
Scénario: Statut de travailleur de nuit acquis par le planning
  Étant donné un salarié autorisé à travailler de nuit, qui n'est pas encore travailleur de nuit
  Quand le planning lui affecte deux nuits de 22 h à 6 h dans la semaine
  Alors les limites du travailleur de nuit s'appliquent à lui, dont 8 h effectives par nuit

Scénario: Seuil annuel atteint
  Étant donné un salarié à 268 h de nuit sur les 12 derniers mois
  Quand le planning lui affecte un créneau d'après-midi qui finit à 23 h (2 h de nuit)
  Alors il atteint le seuil de 270 h et les limites du travailleur de nuit s'appliquent
```

- Chaque règle est une classe avec `add_to_model()` et `evaluate()` (ADR-0020).
- Patterns envisagés :
  - **Stratégie** : chaque règle (déjà imposé par ADR-0020), et le traitement de la couverture (objectif pénalisé en mode standard, contrainte en mode strict) ;
  - **Composite** : un jeu de règles expose la même interface qu'une règle, et regroupe les règles par famille (légales, contractuelles, souples). Le solveur et la PE parcourent un seul objet, et les familles servent au diagnostic d'US-062 ;
  - **Poids mouche** sur les créneaux types, seulement si US-064 l'a retenu.
- Issue explicite de chaque résolution : `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `UNKNOWN`, `CANCELLED`.
- Paramètres : limite de temps, nombre de workers (4 maximum), graine. Le planning publié est fourni en hints, sans garantie d'effet.
- Tests :
  - unitaires, sur des instances construites à la main dont la solution est connue ;
  - de cohérence bidirectionnelle solveur ↔ PE pour chaque règle (Hypothesis) ;
  - sur les nuits de changement d'heure ;
  - en mode déterministe (1 worker).
- Benchmark interne : 40 employés × 1 semaine résolus en moins de 30 s sur le VPS.

### US-062 — Score et explication de base

- Pour chaque planning : sous-effectif chiffré par créneau et par compétence (« 3 caristes CACES requis samedi matin, 2 affectés »), pénalités par règle souple, répartition des heures par employé.
- Pour un job `INFEASIBLE` : les familles de règles en conflit, à la granularité fixée par le spike US-064. Elles sont lues dans le Composite de règles d'US-061.
- Affichage lisible côté manager : « Pourquoi ce planning ? ».
- Découpage (révision du 18 novembre 2026) : le jalon 2 affiche le manque chiffré par créneau et par compétence, déjà calculé (« 2 caristes affectés sur 3 »). Expliquer pourquoi aucun candidat ne peut combler un manque demande une analyse supplémentaire : une règle qui écarte un candidat ne prouve pas, à elle seule, qu'aucun planning complet n'existe. Ce diagnostic fin reste en v0.3 (cadrage, §8). Les panneaux « Pourquoi ce manque » et « Pistes » de la maquette l'attendent.

---

## E7 — Édition et PE

### US-070 — PE synchrone

```gherkin
Scénario: Modification irréalisable
  Étant donné Julie qui finit son shift à 22 h le mardi
  Quand le manager l'affecte au shift de 6 h le mercredi
  Alors la PE répond INFEASIBLE
  Et la violation cite REPOS_QUOTIDIEN_MIN, Julie, mardi 22 h → mercredi 6 h (8 h < 11 h)

Scénario: Modification incertaine
  Étant donné une moyenne hebdomadaire glissante proche de 44 h
  Et des semaines futures pas encore planifiées
  Quand le manager ajoute 4 h à Paul
  Alors la PE répond UNCERTAIN avec le risque expliqué

Scénario: Délai de prévenance
  Étant donné un planning publié et un délai de prévenance de 7 jours sur le site
  Quand le manager modifie un shift prévu dans 3 jours
  Alors la PE répond UNCERTAIN et cite le délai de prévenance
```

- p95 < 200 ms, mesuré et visible dans Grafana.

### US-071 — Grille de planning

- Vue semaine, par employé ou par poste. Couverture visible par créneau (manque ou excès).
- État géré par NgRx SignalStore (annuler, rétablir, mises à jour optimistes).
- Pattern envisagé : **Commande**. Chaque modification (affecter, retirer, déplacer un shift) est un objet qui porte son inverse : la pile d'annulation, la mise à jour optimiste et son retour arrière en cas d'erreur reposent sur le même objet, traduit en requête d'évaluation pour la PE en US-072.
- Conforme à la maquette « Trame — planning moderne » (US-012) et performante avec 40 employés × 7 jours : en-tête de semaine et navigation, chiffres de la semaine, couverture par créneau en tête de chaque jour, salariés groupés par poste, heures face aux bornes du contrat, recherche d'un salarié, panneau du créneau choisi, thèmes clair et sombre, mobile.
- Intégrée par tranches, après chaque capacité back du jalon 2. Les actions dont le back n'existe pas encore ne sont pas affichées.
- Découpage validé le 24 novembre, une PR par tranche : (1) en-tête, navigation entre semaines, pastille du moteur, chiffres de la semaine (« Contraintes du moteur respectées » et le nombre de règles de `outcome.checkedRules`), heures face au contrat et absences, lues dans l'instantané de la génération affichée (#114) ; (2) grille : couverture en tête de chaque jour, groupes par poste le plus souvent occupé, habilitations et leur échéance, recherche, vues Semaine, Jour et Par poste ; (3) panneau du créneau, mobile, thème sombre et parcours Playwright avec axe sur Chromium, Firefox et WebKit. « Publier la semaine » et « Pourquoi ce manque / Pistes » attendent leur back.

### US-072 — Drag & drop avec PE

```gherkin
Scénario: Retour instantané
  Quand le manager glisse un shift vers un autre employé
  Alors le statut PE s'affiche pendant le survol (debounce)
  Et un dépôt INFEASIBLE est refusé avec la règle violée affichée
  Et un dépôt UNCERTAIN demande une confirmation
```

- Navigation au clavier possible (accessibilité). Annuler et rétablir, avec les Commandes d'US-071.

### US-073 — Brouillon et version de référence

- Une génération réussie ouvre le brouillon de la semaine, rattaché à sa version de référence : la génération dont il part, puis la dernière version publiée (US-080).
- Les modifications sont enregistrées côté serveur, dans le brouillon, comme des Commandes (US-071) qui portent leur inverse : annuler et rétablir reposent sur le même objet.
- Chaque écriture porte la version du brouillon qu'elle modifie (verrou optimiste). Une écriture sur une version dépassée est refusée avec la version courante : rien n'est écrasé en silence.
- Prérequis des modifications (US-070, US-072), de la réparation (US-074) et de la publication (US-080).

```gherkin
Scénario: Une génération ouvre un brouillon
  Étant donné la génération réussie de la semaine du 23 novembre
  Alors un brouillon de cette semaine existe, rattaché à cette génération
  Et seuls les managers de l'organisation le voient

Scénario: Modification enregistrée puis annulée
  Étant donné le brouillon de la semaine du 23 novembre
  Quand le manager retire Camille Laurent du samedi 28 au matin
  Alors le brouillon passe à sa version suivante avec cette modification
  Quand il annule cette modification
  Alors Camille Laurent retrouve le samedi 28 au matin

Scénario: Modifications concurrentes
  Étant donné deux managers sur la version 4 du brouillon
  Quand le premier enregistre une modification
  Et que le second enregistre une autre modification, toujours sur la version 4
  Alors la seconde est refusée, avec la version courante à recharger
  Et la modification du premier est conservée

Scénario: Nouvelle génération sur un brouillon modifié
  Étant donné un brouillon modifié à la main
  Quand le manager relance la génération
  Alors il confirme l'abandon de ses modifications, ou renonce à la génération
```

### US-074 — Réparer un planning après une absence

- Le moteur recalcule la semaine à partir du brouillon : chaque changement par rapport à lui est pénalisé (re-planification, cadrage §8), et le brouillon lui est fourni en hints.
- Les affectations verrouillées par le manager ne changent jamais.
- Le résultat est une proposition : la liste des changements, avant et après, et les manques restants. Rien n'est appliqué sans la validation du manager.
- Une fois validée, la proposition entre dans le brouillon comme une seule modification annulable (US-073).
- Pattern envisagé : **Stratégie** pour le mode de résolution (génération complète ou réparation), qui partage le modèle et les règles d'US-061.

```gherkin
Scénario: Remplacer une cariste absente
  Étant donné le brouillon de la semaine du 23 novembre où Inès Fabre tient le lundi 23 au matin
  Et Inès Fabre déclarée absente le lundi 23
  Quand le manager demande une réparation
  Alors la proposition affecte à sa place un cariste habilité et disponible
  Et elle présente chaque changement, avant et après
  Et le nombre de changements est le plus petit qui permette cette couverture

Scénario: Affectations verrouillées
  Étant donné Yanis Morel verrouillé sur le samedi 28 au matin
  Quand la réparation est calculée
  Alors Yanis Morel reste affecté au samedi 28 au matin

Scénario: Rien n'est appliqué sans validation
  Étant donné une proposition de réparation
  Quand le manager la refuse
  Alors le brouillon reste inchangé

Scénario: Proposition validée
  Étant donné une proposition de réparation
  Quand le manager la valide
  Alors ses changements entrent dans le brouillon en une seule modification annulable

Scénario: Manque impossible à combler
  Étant donné qu'aucun cariste habilité n'est disponible le lundi 23 au matin
  Quand la réparation est calculée
  Alors la proposition garde ce manque, chiffré
  Et elle ne déplace personne inutilement
```

---

## E8 — Publication

### US-080 — Publier un planning

- La publication part du brouillon (US-073), qui devient la nouvelle version de référence.
- La version publiée est figée et datée. Une modification ultérieure crée une nouvelle version.
- Un manque restant peut être accepté explicitement à la publication, avec un motif. Il reste visible dans la version publiée.
- Historique des versions avec leurs différences.
- Journal des modifications après publication : qui, quand, quoi, motif.

### US-081 — Consultation par l'employé (S)

- Vue « Mon planning » en web responsive (en attendant la PWA de la v0.2), plus un export iCal.

---

## E9 — Vitrine

### US-090 — Données de démo

- Générateur (`@faker-js/faker`) : un entrepôt fictif de 40 salariés, avec des postes, des compétences, des contrats variés, des créneaux de jour et de nuit, et des besoins réalistes (pics de début de semaine).
- Ce jeu sert de modèle, copié pour chaque visiteur (US-021, ADR-0025).

### US-091 — README vitrine et vidéo

- README avec :
  - les badges (CI, couverture, quality gate, version) ;
  - le schéma d'architecture ;
  - les liens vers la démo, la doc et la page de statut ;
  - le quickstart local.
- Vidéo de 90 s : besoins → génération → explication → modification refusée par la PE → publication.

### US-092 — Protection et ouverture de la démo publique

- Rate limiting par IP au niveau de Traefik et de l'API (`@nestjs/throttler`).
- Quotas par organisation de démo : une génération à la fois, taille de problème bornée, nombre de générations par heure limité. Plafond global d'organisations de démo actives.
- Scan OWASP ZAP sur staging.
- Avant l'ouverture : balayage complet des ports (`check-externe.sh --complet`), et revue des tests d'accès croisé.
- L'authentification Traefik qui fermait la prod est retirée une fois tout le reste vert.

```gherkin
Scénario: Quota de génération
  Étant donné une organisation de démo avec une génération en cours
  Quand elle en lance une seconde
  Alors elle reçoit une réponse 429 au format problem+json
```

### US-014 — Quality gate et tests de mutation (S)

- Quality gate SonarCloud bloquante : couverture ≥ 90 % sur le domaine, ≥ 80 % au global.
- Stryker sur les libs `domain`, avec un score de mutation minimal fixé après une première mesure.

### US-093 — Licence, sécurité et mentions légales

- `LICENSE` (MIT) et `SECURITY.md` vérifiés (présents depuis US-002).
- Page de mentions légales sur la démo (éditeur, hébergeur OVH).
- Aucun traceur, donc pas de bandeau cookies.
