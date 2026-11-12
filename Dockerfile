# syntax=docker/dockerfile:1
# Dokploy: Build Type = Dockerfile, path = Dockerfile, context = ., port = 80
#
# Один контейнер: Node-сервис отдаёт SPA и API (/api), данные — в Postgres Supabase.
#
# Runtime env (Dokploy → Environment), см. docs/DEPLOY.md:
#   DATABASE_URL=postgres://postgres:<POSTGRES_PASSWORD>@<хост-БД>:5432/postgres
#   INITIAL_ADMIN_EMAIL=...       # только для первого запуска на пустой базе
#   INITIAL_ADMIN_PASSWORD=...
#
# Build args (необязательно):
#   VITE_API_BASE=/api            # пусто → старый portable-режим (данные в браузере)

# ── Build ────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_APP_ENV=production
ARG VITE_API_BASE=/api
ENV VITE_APP_ENV=$VITE_APP_ENV \
    VITE_API_BASE=$VITE_API_BASE

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm run build:server

# ── Runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=80 \
    STATIC_DIR=/app/dist

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1

EXPOSE 80
CMD ["node", "dist-server/main.js"]
