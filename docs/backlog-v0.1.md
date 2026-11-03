# Trame — Backlog v0.1 (MVP)

**Objectif de la v0.1** : un manager génère, ajuste avec la PE et publie le planning hebdomadaire d'un site. Le tout est déployé en production, documenté, observé, et accessible en démo publique.

Chaque US devient une issue GitHub, à partir de ce fichier (label `epic:Ex`, milestone `v0.1`). Les comportements sont précisés avec Kim par des exemples métier (BDD), puis leurs scénarios Gherkin sont validés avec le plan et deviennent des tests d'acceptation. Les nouveaux comportements et corrections sont implémentés en TDD : test en échec, code qui passe, puis refactorisation pour la lisibilité. La portée, les vérifications adaptées, la Definition of Ready et la Definition of Done sont celles d'`AGENTS.md`.

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
| 8     | 009 | Walking skeleton                                                   | M        |
| 9     | 005 | Déploiement staging et prod (prod fermée au public)                | M        |
| 10    | 008 | Sauvegardes                                                        | M        |
| 11    | 020 | Connexion OIDC et rôles                                            | M        |
| 12    | 012 | Maquettes des écrans clés                                          | M        |
| 13    | 010 | Tokens de marque                                                   | M        |
| 14    | 011 | Composants de base                                                 | M        |
| 15    | 030 | Module de référence `organization`, PR C : page Angular et E2E     | M        |
| 16    | 007 | Observabilité de base et alertes                                   | S        |
| 17    | 006 | Site de documentation                                              | S        |

### Phase 2 — pendant le stage (sessions courtes : une story = un déploiement)

| Ordre | US  | Titre                                        | Priorité |
| ----- | --- | -------------------------------------------- | -------- |
| 18    | 031 | Employés                                     | M        |
| 19    | 032 | Contrats                                     | M        |
| 20    | 033 | Indisponibilités et absences                 | M        |
| 21    | 040 | Catalogue des règles légales                 | M        |
| 22    | 050 | Besoins de couverture                        | M        |
| 23    | 064 | Spike CP-SAT                                 | M        |
| 24    | 061 | Modèle CP-SAT v1                             | M        |
| 25    | 060 | Lancer une génération                        | M        |
| 26    | 062 | Score et explication de base                 | M        |
| 27    | 070 | PE synchrone                                 | M        |
| 28    | 071 | Grille de planning                           | M        |
| 29    | 072 | Drag & drop avec PE                          | M        |
| 30    | 080 | Publier un planning                          | M        |
| 31    | 021 | Comptes démo (une organisation par visiteur) | M        |
| 32    | 090 | Données de démo                              | M        |
| 33    | 092 | Protection et ouverture de la démo publique  | M        |
| 34    | 093 | Licence, sécurité et mentions légales        | M        |
| 35    | 091 | README vitrine et vidéo                      | M        |
| 36    | 014 | Quality gate et tests de mutation            | S        |
| 37    | 041 | Pondération des règles souples               | S        |
| 38    | 081 | Consultation par l'employé                   | S        |

Les stories M, prises dans cet ordre, forment le **chemin critique vers la démo publique**. La démo est datée quelques semaines avant la recherche d'entreprise.

Plusieurs stories n'ont encore qu'une liste de besoins (031, 032, 040, 050, 071, 080…). Elles reçoivent leurs critères Gherkin avant de démarrer : c'est la Definition of Ready.

---

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

> Scripts écrits le 2026-11-01 dans `vps-edge/host/`, **pas encore appliqués sur l'hôte**.

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
- Ce socle est rangé dans `libs/platform/` (`clock`, `problem-details`, `zod-validation`, `config`, `logging`, `health`), chaque lib avec son README. Les autres libs `platform` arrivent avec leur story : `outbox`, `inbox` et `idempotency` avec US-009, `audit` avec US-040. `auth`, `ids` et `pagination` sont arrivées avec US-030 ; `auth` attend son résolveur OIDC (US-020).
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

```gherkin
Scénario: Livraison continue sur staging
  Quand une PR est mergée sur main
  Alors les images sont construites, scannées (Trivy), signées (cosign) et poussées sur GHCR
  Et staging est redéployé avec les migrations appliquées
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

- OpenTelemetry dans l'API et le moteur. Une trace relie la requête HTTP, le message RabbitMQ et la résolution.
- Prometheus, Loki, Tempo et Grafana avec des rétentions bornées. Un dashboard « Santé » : latence, erreurs, durée des résolutions, files.
- Objectifs de service : disponibilité de 99 % sur 30 jours, PE p95 < 200 ms, résolution hebdomadaire < 30 s. Alertes Grafana par e-mail.
- Uptime Kuma sur `status.`, en page publique.

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

```gherkin
Scénario: Aller-retour complet
  Étant donné l'application déployée
  Quand je clique sur « Tester le moteur » dans le front
  Alors l'API écrit un événement dans l'outbox
  Et le moteur reçoit le job via RabbitMQ et résout un problème CP-SAT trivial
  Et l'API enregistre le résultat via l'inbox
  Et le front affiche la progression (SSE) puis le résultat
  Et la trace complète est visible dans Grafana
```

> **Question ouverte (2026-11-03)** : les routes métier répondent 401 tant qu'OIDC n'est pas branché (US-020). Avant de démarrer, préciser comment déclencher le parcours : endpoint technique dédié, utilisateur de développement, ou US-020 avant US-009.

---

## E1 — Design system

### US-012 — Maquettes des écrans clés

- Maquettes Figma de : la grille de planning, la génération avec sa progression, l'explication d'un planning, les trois états de la PE pendant un drag & drop, la vue employé (PWA).
- Elles fixent la direction visuelle (palette Trame, typographie, densité) et alimentent les tokens d'US-010.
- Validées par Kim avant US-071. C'est la Definition of Ready des stories d'interface.

### US-010 — Tokens de marque

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

En attendant US-020, l'utilisateur et son `organizationId` passent par le point d'entrée de `libs/platform/auth` : les tests y injectent un utilisateur de test, et les endpoints répondent 401 hors des tests.

> **PR A livrée le 2026-11-02 (#7).** Décisions prises en revue croisée :
>
> - un créneau type a toujours une pause ; le minimum légal de pause (L3121-16) est une contrainte de planning, qui relève du moteur ;
> - le libellé d'un créneau n'est pas unique : son identifiant suffit ;
> - durées : une heure locale désigne le premier instant où l'horloge du site l'affiche, et une heure sautée au passage à l'heure d'été désigne l'instant du saut ;
> - types d'erreur en URI `tag:` (ADR-0028), UUID v7 ordonnés même dans la même milliseconde, clé étrangère composite qui garantit l'organisation d'un créneau.
>
> **PR B livrée le 2026-11-03 (#11)**, scénarios dans l'issue #10. Une compétence exigée par un poste ne peut pas être supprimée : le use case le vérifie, et la clé étrangère `ON DELETE RESTRICT` couvre une suppression concurrente, renvoyée avec la même erreur. La PR corrige aussi deux défauts de la PR A : le caractère NUL, refusé désormais dans tous les textes saisis (contrat `requiredText`), et la date de création, désormais à la milliseconde.

### US-031 — Employés

- CRUD : compétences, habilitations avec date d'expiration (ex. CACES).

```gherkin
Scénario: Habilitation expirée
  Étant donné un cariste dont le CACES expire le 10 décembre
  Quand je génère le planning de la semaine du 14 décembre
  Alors il n'est affecté à aucun shift qui exige ce CACES
```

### US-032 — Contrats

- Type de contrat, volume horaire hebdomadaire minimum et maximum, jours travaillables, dates de début et de fin, indicateur « peut travailler de nuit ». Le statut de travailleur de nuit, lui, est calculé par le moteur (US-061).
- Un seul contrat actif par employé et par période.

### US-033 — Indisponibilités et absences

- Saisie minimale par le manager en v0.1 (par l'employé en v0.2) : période, motif (catégorie, sans détail médical).
- Indispensable avant la génération : les absences sont une entrée du moteur, et l'absence de dernière minute est au cœur du produit.

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

### US-041 — Pondération des règles souples (S)

- Poids réglables par site, avec un préréglage « équilibré ».

---

## E5 — Besoins

### US-050 — Besoins de couverture

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
- le mode déterministe (1 worker) pour les tests.

Livrable : une note technique et une ADR qui fixe les paramètres de résolution.

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
- Pour un job `INFEASIBLE` : les familles de règles en conflit, à la granularité fixée par le spike US-064.
- Affichage lisible côté manager : « Pourquoi ce planning ? ».

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
- Conforme aux maquettes d'US-012 et performante avec 40 employés × 7 jours.

### US-072 — Drag & drop avec PE

```gherkin
Scénario: Retour instantané
  Quand le manager glisse un shift vers un autre employé
  Alors le statut PE s'affiche pendant le survol (debounce)
  Et un dépôt INFEASIBLE est refusé avec la règle violée affichée
  Et un dépôt UNCERTAIN demande une confirmation
```

- Navigation au clavier possible (accessibilité). Annuler et rétablir.

---

## E8 — Publication

### US-080 — Publier un planning

- La version publiée est figée et datée. Une modification ultérieure crée une nouvelle version.
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
