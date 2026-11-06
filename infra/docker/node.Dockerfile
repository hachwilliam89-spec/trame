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
COPY infra/rabbitmq/diagnostic-topology.json ./topology.json
ENV DIAGNOSTIC_TOPOLOGY_FILE=/app/topology.json
USER node
CMD ["node", "main.js"]

FROM installer AS migration-dependencies
WORKDIR /runtime
COPY --from=builder /workspace/dist/migrator/package.json /workspace/dist/migrator/pnpm-lock.yaml /workspace/dist/migrator/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM toolchain AS migrator
# La migration ne lance que la CLI Prisma avec node : npm et corepack ne lui servent pas.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
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
# L'image de base (digest inchangé au 2026-11-06) a libexpat 2.9.0, aux failles hautes corrigées
# en 2.10.0. Sans effet dès qu'une base plus récente l'inclut.
USER root
RUN apk upgrade --no-cache libexpat && apk info --exists 'libexpat>=2.10.0'
COPY --from=web-assets /workspace/dist/apps/web/browser /usr/share/nginx/html
COPY infra/docker/web/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=555 infra/docker/web/entrypoint.sh /trame-entrypoint.sh
USER 101
EXPOSE 8080
ENTRYPOINT ["/trame-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
