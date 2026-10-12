# syntax=docker/dockerfile:1
# Локальный/compose путь. Для Dokploy используйте корневой ./Dockerfile.

FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_APP_ENV=production
ARG VITE_PERSIST_LOCAL_DB=false
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

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.dokploy.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
