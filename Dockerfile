FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --ignore-scripts --no-audit --no-fund && \
    npm pkg delete devDependencies && \
    npm pkg set dependencies.firebase=10.14.1 dependencies.firebase-admin=13.6.0 && \
    npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node index.html *.css *.mjs *.js ./
COPY --chown=node:node assets ./assets
COPY --chown=node:node materials ./materials
COPY --chown=node:node document-format ./document-format
COPY --chown=node:node workspace-context ./workspace-context
COPY --chown=node:node workspace-persistence ./workspace-persistence
COPY --chown=node:node workspace-ui ./workspace-ui
COPY --chown=node:node release-candidate ./release-candidate
COPY --chown=node:node rollout-preflight/staging-auth.mjs rollout-preflight/staging-html.mjs rollout-preflight/stage-server.mjs ./rollout-preflight/
COPY --chown=node:node pilot/config.mjs pilot/server.mjs ./pilot/
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "pilot/server.mjs"]
