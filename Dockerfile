# syntax=docker/dockerfile:1.7

# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app
# bcrypt ships prebuilt binaries; build tools are only needed if a prebuild is unavailable.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
# tini forwards SIGTERM so graceful shutdown runs.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--require", "./dist/instrumentation.js", "dist/server.js"]
