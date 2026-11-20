FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY index.html *.css *.mjs *.js ./
COPY assets ./assets
COPY materials ./materials
COPY document-format ./document-format
COPY workspace-context ./workspace-context
COPY workspace-persistence ./workspace-persistence
COPY workspace-ui ./workspace-ui
COPY release-candidate ./release-candidate
COPY rollout-preflight/staging-auth.mjs rollout-preflight/staging-html.mjs rollout-preflight/stage-server.mjs ./rollout-preflight/
COPY pilot/config.mjs pilot/server.mjs ./pilot/
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "pilot/server.mjs"]
