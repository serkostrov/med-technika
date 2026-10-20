# syntax=docker/dockerfile:1
# Dokploy: Build Type = Dockerfile, path = Dockerfile, context = ., port = 80
#
# Build-time args (Dokploy → Environment → Build Arguments):
#   VITE_APP_ENV=production
#   VITE_PERSIST_LOCAL_DB=true
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...

# ── Build SPA ────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_APP_ENV=production
# Portable SPA: persist справочники/протоколы в localStorage (пока нет Postgres API)
ARG VITE_PERSIST_LOCAL_DB=true
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=

ENV VITE_APP_ENV=$VITE_APP_ENV \
    VITE_PERSIST_LOCAL_DB=$VITE_PERSIST_LOCAL_DB \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Nginx runtime ────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.dokploy.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Dokploy / Traefik healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
