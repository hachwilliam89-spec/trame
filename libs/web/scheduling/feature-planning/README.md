# Page Planning

Intégration Angular de la maquette validée (`trame-planning-lecture.html`, PR 8 du jalon #69). L'adresse `/planning?site=<uuid>&semaine=<lundi>` ouvre la semaine ; la coque rouvre cette adresse au retour de la connexion.

- **Deux sources** : `latestAttempt` porte le message sur le calcul en cours ou son issue, `latestSchedule` porte la couverture et la grille. Un nouvel essai qui échoue laisse donc le planning précédent affiché.
- **Vues** : Semaine, Jour (par défaut sous 560 px) et Employé (la semaine d'un salarié, ouverte depuis son nom). La couverture est séparée des affectations ; les horaires des créneaux sont regroupés dans la légende.
- **Données** : horaires, minutes effectives et contrats viennent de l'instantané calculé ; le site, les créneaux, les postes et les salariés n'apportent que leurs libellés. Le poste du jour n'apparaît dans la case que pour un salarié qui alterne entre plusieurs postes dans la semaine.
- **Modèle d'affichage** : `planning-view.ts` et ses voisins sont des fonctions pures, testées par Vitest. Les gabarits ne calculent rien. Les dates sont calculées avec `Intl`, sans Temporal, que tous les navigateurs pris en charge n'ont pas encore.
- **Styles** : `planning-page.css`, importée par la feuille de l'application (CSP `style-src 'self'`), avec des sélecteurs préfixés par la page.
