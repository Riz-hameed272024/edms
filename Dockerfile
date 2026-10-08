# ---- build stage: install only production deps reproducibly ----
FROM node:20.18.1-alpine3.20 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- runtime stage: minimal image, non-root, no package manager ----
FROM node:20.18.1-alpine3.20
LABEL org.opencontainers.image.title="edms-api" \
      org.opencontainers.image.source="https://github.com/<your-user>/edms" \
      org.opencontainers.image.version="1.0.0"
ENV NODE_ENV=production PORT=8080
WORKDIR /app
# remove npm/yarn so an attacker in the container cannot install tools
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "src/server.js"]
