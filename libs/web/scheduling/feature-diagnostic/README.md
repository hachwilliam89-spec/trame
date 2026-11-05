# Premier écran Guidé

Présentation validée par Kim le 5 novembre 2026. Ce composant affiche l'état de `DiagnosticState`, déclenche ses commandes et présente les affectations uniquement quand le résultat en porte une. Aucun calcul, OAuth, stockage ou décodage réseau dans le composant.

Le shell Angular porte la connexion et la déconnexion. La palette et le logo d'origine Trame sont conservés ; pas de bibliothèque de composants ajoutée pour ce seul écran. Les tests Angular couvrent la présentation des cinq issues, les tests Playwright le parcours réel et axe son accessibilité.
