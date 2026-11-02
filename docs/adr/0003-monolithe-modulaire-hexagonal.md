# ADR-0003 — API en monolithe modulaire hexagonal + DDD

- **Statut** : Accepté
- **Contexte** : il faut une architecture exigeante mais proportionnée à un développeur et à un VPS.
- **Décision** : NestJS en monolithe modulaire. Chaque bounded context est découpé en `domain` / `application` / `infrastructure`. Les contrôleurs REST, les gateways temps réel et l'agent IA sont des adaptateurs primaires qui n'appellent que des use cases.
- **Conséquences** :
  - (+) Un seul déploiement, des frontières claires, un découpage ultérieur possible.
  - (−) Plus de code de mapping (domaine ↔ persistance).
- **Alternatives écartées** : micro-services (complexité opérationnelle sans bénéfice à cette échelle) ; une architecture en couches classique (domaine couplé au framework).
