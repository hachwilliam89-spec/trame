FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS base
WORKDIR /app
ENV NODE_ENV=production
# Les processus ne lancent que node : npm et corepack, fournis par l'image de base, ne servent pas
# à l'exécution et embarquent leurs propres dépendances (failles hautes relevées par Trivy, #44).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# La construction et la CLI de migration ont besoin de Git/OpenSSL déjà figés dans cette base.
# Les processus API/relais gardent la variante slim, sans les outils de compilation.
FROM node:26.13.0-bookworm@sha256:6cbd8d89163e7f30fd577138079aaa29aeea5d05cd2894ac5dd4e24bea360f26 AS toolchain
WORKDIR /app
ENV NODE_ENV=production

FROM toolchain AS installer
RUN npm install --global pnpm@12.16.1

FROM installer AS builder
ENV NODE_ENV=development NX_DAEMON=false NX_NO_CLOUD=true NX_ISOLATE_PLUGINS=false LEFTHOOK=0
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Le contexte ne contient pas Git : installer des hooks ici n'a pas de sens.
# Les scripts des dépendances restent contrôlés par allowBuilds.
RUN npm pkg delete scripts.prepare && pnpm install --frozen-lockfile
COPY . .
RUN pnpm nx run-many -t build -p api relay web --configuration=production
RUN node infra/docker/package-migrator.cjs

FROM installer AS api-dependencies
WORKDIR /runtime
COPY --from=builder /workspace/dist/apps/api/package.json /workspace/dist/apps/api/pnpm-lock.yaml /workspace/dist/apps/api/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS api
COPY --from=api-dependencies /runtime/node_modules ./node_modules
COPY --from=builder /workspace/dist/apps/api/main.js ./main.js
USER node
EXPOSE 3000
CMD ["node", "main.js"]

FROM installer AS relay-dependencies
WORKDIR /runtime
COPY --from=builder /workspace/dist/apps/relay/package.json /workspace/dist/apps/relay/pnpm-lock.yaml /workspace/dist/apps/relay/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS relay
COPY --from=relay-dependencies /runtime/node_modules ./node_modules
COPY --from=builder /workspace/dist/apps/relay/main.js ./main.js
COPY infra/rabbitmq/diagnostic-topology.json infra/rabbitmq/schedule-topology.json ./
ENV DIAGNOSTIC_TOPOLOGY_FILE=/app/diagnostic-topology.json \
    SCHEDULE_TOPOLOGY_FILE=/app/schedule-topology.json
USER node
CMD ["node", "main.js"]

FROM installer AS migration-dependencies
WORKDIR /runtime
COPY --from=builder /workspace/dist/migrator/package.json /workspace/dist/migrator/pnpm-lock.yaml /workspace/dist/migrator/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM toolchain AS migrator
# La migration ne lance que la CLI Prisma avec node : npm et corepack ne lui servent pas. La
# bibliothèque cliente C de PostgreSQL de l'image de base non plus, Prisma ayant son propre client :
# elle est retirée, avec ses failles hautes que cette base (digest inchangé au 2026-11-14) n'a pas
# encore corrigées. dpkg échoue si un autre paquet en dépend.
# L'analyse refuse toute faille haute ou critique déjà corrigée par Debian. Cette base complète
# embarque des paquets de compilation (en-têtes du noyau, par exemple) dont les correctifs
# arrivent avant un nouveau digest : ils sont appliqués ici (CVE-2026-99083, 2026-11-16).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  && dpkg --purge libpq-dev libpq5 \
  && apt-get update \
  && apt-get upgrade --yes --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
COPY --from=migration-dependencies /runtime/node_modules ./node_modules
COPY libs/api/shared/database/prisma ./prisma
COPY infra/docker/prisma.config.ts ./prisma.config.ts
USER node
ENTRYPOINT ["node", "node_modules/prisma/build/index.js"]
CMD ["migrate", "deploy"]

FROM builder AS web-assets
# La configuration de développement n'est pas un défaut valide dans une image livrable.
RUN rm /workspace/dist/apps/web/browser/config.json

FROM nginx/nginx-unprivileged:1.30.6-alpine@sha256:44e74ca483234093081138b6d7b6f561d55557756a2deefc3a5056148defeb99 AS web
# L'image de base (digest inchangé au 2026-11-14) a deux paquets aux failles hautes déjà corrigées
# par Alpine : libexpat 2.9.0 (corrigé en 2.10.0) et libxslt 1.1.43-r3 (corrigé en 1.1.43-r4).
# Sans effet dès qu'une base plus récente les inclut.
USER root
RUN apk upgrade --no-cache libexpat libxslt \
  && apk info --exists 'libexpat>=2.10.0' \
  && apk info --exists 'libxslt>=1.1.43-r4'
COPY --from=web-assets /workspace/dist/apps/web/browser /usr/share/nginx/html
COPY infra/docker/web/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=555 infra/docker/web/entrypoint.sh /trame-entrypoint.sh
USER 101
EXPOSE 8080
ENTRYPOINT ["/trame-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
