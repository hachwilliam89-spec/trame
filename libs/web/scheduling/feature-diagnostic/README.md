# Premier écran Guidé

Présentation validée par Kim le 5 novembre 2026. Ce composant affiche l'état de `DiagnosticState`, déclenche ses commandes et présente les affectations uniquement quand le résultat en porte une. Aucun calcul, OAuth, stockage ou décodage réseau dans le composant.

La page reprend la charte de l'accueil (révision du 15 novembre 2026) : un bandeau aux couleurs du logo (jetons `--weave-*` de `libs/web/brand`) porte le titre, le statut et la marque Trame. Le résultat est dessiné comme un tissage par `AssignmentWeave` : un fil relie chaque tâche au poste retenu, et les lecteurs d’écran reçoivent la même affectation en tableau, toujours présent. Trois faits suivent, tous lus dans le résultat : l'issue du solveur, la durée de la demande au résultat (absente tant que la fin n'est pas connue) et le coût. Les détails montrent l'affectation, la matrice des coûts soumise au moteur et ses paramètres. Un encart annonce la suite sans la présenter comme disponible.

Le shell Angular porte la connexion et la déconnexion. La palette et le logo d'origine Trame sont conservés ; pas de bibliothèque de composants ajoutée pour ce seul écran. Les tests Angular couvrent la présentation des cinq issues, les tests Playwright le parcours réel et axe son accessibilité.

Les feuilles CSS restent à côté des composants, mais sont importées par la feuille externe de l’application pour respecter `style-src 'self'`. Leurs sélecteurs sont préfixés par le composant. Le test navigateur de la chaîne réelle vérifie que les fils sont tracés sans remplissage et que le schéma reste compact. Après le calcul, les étapes sont condensées ; les détails restent repliables.
