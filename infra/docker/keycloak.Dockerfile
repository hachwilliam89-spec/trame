# Keycloak préparé pour la production (US-005 B2a, #47), selon la recommandation de Keycloak.
#
# `kc.sh build` fixe une fois pour toutes les options de construction. Le service démarre ensuite
# en `start --optimized`, sans reconstruire sa configuration : sa racine peut rester en lecture
# seule. Un démarrage non préparé tenterait d'écrire dans /opt/keycloak/lib et échouerait.
#
# Construite sur le VPS par `docker compose build` (stack trame-shared). L'image de base reste au
# digest de dev.yml, ce que vérifie le test de politique des stacks.

FROM quay.io/keycloak/keycloak:26.8.1@sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332 AS builder
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8.1@sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
