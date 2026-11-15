# Architecture du front Angular

Décision de Kim du 15 novembre 2026 : exploiter les capacités d’Angular lorsqu’elles servent la lisibilité, l’expérience utilisateur et la maintenabilité. Ces règles complètent les ADR-0009, 0023 et 0033. Elles ne demandent ni réécriture générale ni ajout de bibliothèques avant un besoin concret.

## Responsabilités

| Emplacement                      | Responsabilité                                                                   | Ne doit pas faire                                           |
| -------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/web`                       | Démarrage, configuration publique, routes, assemblage et coque de navigation     | Accumuler le comportement de chaque écran métier            |
| `libs/web/<context>/feature-*`   | Pages, interactions et présentation du contexte                                  | Appeler directement HTTP, Keycloak ou les transports        |
| `libs/web/<context>/data-access` | Adaptateurs réseau, façade et état du parcours                                   | Définir une règle de planning ou dépendre des composants    |
| `libs/web/ui`                    | Composants visuels réutilisables, pilotés par leurs entrées et sorties           | Connaître une organisation, un endpoint ou une règle métier |
| `libs/web/brand`                 | Tokens de marque partagés (couleurs, puis espacements/typographie si réutilisés) | Définir le comportement d’un écran                          |
| `libs/shared/contracts`          | Contrats échangés avec l’API                                                     | Porter l’état de l’interface                                |

Organiser par fonctionnalité. Un composant propre à un écran reste près de cet écran ; il n’entre dans `ui` que lorsqu’il est effectivement réutilisable. Ne pas créer de répertoires ou de libs vides. Le front ne reproduit pas les couches du back à l’identique : seules les séparations utiles sont conservées. Les règles de planification restent au moteur et les autorisations à l’API.

## État et réactivité

- Composants standalone, rendu zoneless existant et stratégie `OnPush` explicite. `signal` pour l’état local ; `computed` pour les valeurs dérivées et les modèles de présentation.
- Dans les nouvelles façades, garder les signaux modifiables privés et exposer `asReadonly()`. Les modifications passent par des méthodes nommées (`start`, `resume`, etc.). Ne pas muter profondément un objet exposé : lecture seule du signal ne signifie pas gel de son contenu.
- Une seule source de vérité par donnée. Ne pas recopier les données d’un signal dans un autre avec `effect`. Réserver les effets aux ponts vers des API impératives ; nettoyer leurs ressources. `linkedSignal` convient à un état à la fois dérivé et modifiable, si ce besoin existe.
- `input()` et `output()` pour les nouveaux composants ; `model()` uniquement pour une interaction réellement bidirectionnelle. Les templates lisent des valeurs prêtes à afficher, sans calcul coûteux.
- États observables explicites : chargement, vide, succès, refus, erreur et reprise. Une façade coordonne le parcours ; un composant affiche l’état et transmet les intentions.
- RxJS reste pertinent pour les flux temporels et leur composition. Éviter les allers-retours Observable/signal et les souscriptions imbriquées ; placer la conversion à la frontière et libérer les souscriptions (`takeUntilDestroyed` lorsque pertinent).
- NgRx SignalStore est prévu pour la future grille par le cadrage. Ne pas l’introduire dans un petit écran déjà couvert par une façade simple. Sa première utilisation doit justifier le besoin.

## Réseau et durée de vie

- Pour de nouvelles lectures HTTP réactives, considérer `httpResource` dans `data-access`, après vérification dans la version Angular épinglée et de sa compatibilité avec l’authentification. Traiter explicitement erreurs, absence de données et annulation.
- Les écritures restent des commandes explicites : pas de `POST` déclenché par une ressource réactive ou un effet. Conserver les clés d’idempotence et le traitement des réponses tardives.
- L’adaptateur Fetch/SSE authentifié existant reste en place tant qu’un remplacement n’apporte pas un bénéfice prouvé. L’ADR-0033 impose la reprise du flux, la validation des messages et les jetons en mémoire.
- L’état métier de l’écran est limité au parcours ou au contexte pertinent. Au changement de compte ou d’organisation, annuler les requêtes et vider l’état concerné avant d’afficher le nouveau contexte.
- Utiliser l’injection de dépendances et des ports aux frontières qui ont de vraies variantes ou doublures de test. Pas d’interface, de service ou de factory supplémentaire pour chaque fonction.

## Design et expérience

Angular apporte la composition et les interactions ; la direction visuelle appartient à Trame. Conserver le logo bicolore et la direction Tissage validée.

- HTML sémantique et contrôles natifs d’abord. Composants petits, nommés par leur rôle, avec des états cohérents. Les styles propres à un composant restent près de lui ; les tokens réutilisés vont dans `brand`.
- CDK pour les besoins concrets de focus, dialogues/overlays, drag-and-drop ou listes virtualisées. Son utilisation n’impose pas le style Material. Vérifier clavier, lecteur d’écran et alternative au glisser-déposer : le CDK ne remplace pas les tests du parcours.
- `@if`, `@switch` et `@for` avec une identité `track` stable. Une liste dynamique ne se suit pas par son index si ses éléments se déplacent.
- Charger les futures routes métier à la demande. `@defer` seulement pour une partie secondaire coûteuse, avec un emplacement réservé stable ; jamais pour retarder le hero ou l’action principale sans mesure qui le justifie.
- Animations discrètes pour expliquer un changement réel ; respecter `prefers-reduced-motion`. Ne pas animer un faux calcul ni afficher un résultat inventé.
- Lisibilité, contraste, focus visible, erreurs compréhensibles et parcours mobile sont des critères de livraison. Les formulaires emploient l’API stable adaptée à leur complexité ; vérifier le statut des Signal Forms dans la version épinglée avant adoption, sans migration motivée par la seule nouveauté.

## Vérification et évolution

BDD/TDD selon `AGENTS.md` : tester les comportements des façades et les interactions des composants, puis les parcours réels dans les trois moteurs de navigateur. Une modification visuelle se vérifie avec des captures aux largeurs utiles et axe, complétés par la navigation clavier.

Mesurer avant d’optimiser : taille des bundles, chargement, coût du rendu et de l’interaction concernée. Virtualisation, Web Worker, cache ou SSR ne s’ajoutent pas sans problème observé. Une nouvelle abstraction doit réduire une difficulté identifiée.

Le front actuel possède déjà des composants standalone/OnPush, des façades à signals, des adaptateurs OIDC/HTTP/SSE et des tokens séparés. Ces règles orientent les prochaines stories ; elles ne prétendent pas que tout l’existant est déjà conforme (notamment l’encapsulation des signaux modifiables et la répartition des styles). Corriger ces écarts lors d’une évolution pertinente, avec les tests existants.

## Sources officielles consultées le 15 novembre 2026

- [Organisation par fonctionnalités et conventions Angular](https://angular.dev/style-guide).
- [Signals, valeurs dérivées et exposition en lecture seule](https://angular.dev/guide/signals).
- [Usage limité des effets](https://angular.dev/guide/signals/effect).
- [Lectures HTTP réactives et mutations](https://angular.dev/guide/http/http-resource).
- [Rendu zoneless](https://angular.dev/guide/zoneless).
- [CDK : composants et comportements](https://material.angular.dev/cdk/categories).

Ces pages évoluent : le dépôt et ses versions épinglées restent la référence pour vérifier la disponibilité d’une API avant de la coder.
