# Keycloak préparé pour la production (US-005 B2a, #47), selon la recommandation de Keycloak.
#
# `kc.sh build` fixe une fois pour toutes les options de construction. Le service démarre ensuite
# en `start --optimized`, sans reconstruire sa configuration : sa racine peut rester en lecture
# seule. Un démarrage non préparé tenterait d'écrire dans /opt/keycloak/lib et échouerait.
#
# Construite sur le VPS par `docker compose build` (stack trame-shared). L'image de base reste au
# digest de dev.yml, ce que vérifie le test de politique des stacks.

FROM quay.io/keycloak/keycloak:26.8.2@sha256:c68e286cacd87b942ac1939a0a1481461109d6acd3a57dc496969a319a76bbf0 AS builder
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8.2@sha256:c68e286cacd87b942ac1939a0a1481461109d6acd3a57dc496969a319a76bbf0
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
