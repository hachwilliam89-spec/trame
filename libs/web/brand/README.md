# Marque Trame

La palette Encre et vermillon est partagée par la vitrine, le diagnostic et le planning. Le vermillon repère les actions et le lilas et le bleu distinguent les créneaux : le matin est le plus clair, l’après-midi plus soutenu, avec un filet bleu en thème sombre. L’ambre indique un manque de couverture. Chaque état garde un libellé. Les couleurs claires et sombres suivent le thème du navigateur.

## Logo

Les variantes servies par `apps/web/public` reprennent les cinq T tissés et le mot-symbole du kit `docs/brand/logo-v2/` avec les couleurs Encre et vermillon. La géométrie est commune aux variantes. Le relief vient du support CSS du symbole dans le bandeau de la vitrine.

En petit (en-tête, favicon), le logo passe à trois couleurs : le T et le ⊥ en vermillon (la chaîne), le ⊢ et le ⊣ en bleu (la trame), le T central en encre sur fond clair et en crème sur fond sombre. Le symbole du bandeau garde ses cinq couleurs.

## Polices

- Titres : Bricolage Grotesque (variable), pour `h1` et `h2` seulement.
- Texte : IBM Plex Sans 400, 500 et 600.
- Heures, durées et mesures : IBM Plex Mono 400 et 500, chiffres tabulaires.

Les trois familles (SIL OFL 1.1) viennent des paquets `@fontsource` et sont servies par l'application : la CSP (`font-src 'self'`) refuse toute autre origine, Google Fonts comprise. IBM Plex se limite au sous-ensemble latin. Le test d'intégration du front vérifie leur chargement dans l'application construite, sous sa CSP.
