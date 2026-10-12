# Инструкция по запуску

## Требования

- Node.js 22+
- npm 10+
- (опционально) Docker — SPA и/или Postgres
- (опционально) [Supabase CLI](https://supabase.com/docs/guides/cli) для `supabase db reset`

## Локальная разработка

```bash
cp .env.example .env   # VITE_PERSIST_LOCAL_DB=true по умолчанию в dev
npm ci
npm run dev
```

Откройте http://localhost:5173

Seed-учётки (bootstrap in-memory / `008_auth_accounts.dev.sql`):

| Роль | Email | Пароль |
|------|-------|--------|
| Начальник ИЛ | `head@il.local` | `head-test-password` |
| Инженер | `engineer@il.local` | `engineer-test-password` |

## Тесты

```bash
npm test
npm run build
```

## SQL seed из TypeScript

Источник правды для справочников — `src/data/seed/*`. SQL генерируется:

```bash
npm run seed:sql
# → supabase/seed/001_*.sql … 008_*.sql
```

## Postgres (миграции)

```bash
npm run seed:sql
npm run docker:db          # Postgres 16 + migrations + seed
```

Или:

```text
supabase/migrations/001_schema.sql
supabase/migrations/002_app_auth.sql
supabase/seed/*.sql
```

Полные клиентские справочники (278 ОА, 70 СИ) — через UI «Справочники» после входа начальника.

## Production build (без Docker)

```bash
export VITE_APP_ENV=production
export VITE_PERSIST_LOCAL_DB=false
npm ci
npm run build
npm run preview   # проверка dist на :4173
```

Раздавайте `dist/` через Nginx/Caddy с SPA fallback на `index.html`.

Подробнее: [DEPLOY.md](DEPLOY.md).

## Docker (SPA)

```bash
npm run docker:up
# http://localhost:8080
```

**Dokploy:** Build Type = Dockerfile, path `Dockerfile`, context `.`, port `80`.  
Подробнее: [DEPLOY.md](DEPLOY.md#dokploy).

HTTPS — на внешнем reverse proxy / Dokploy.

## Backup / restore

См. [docs/ops/BACKUP.md](ops/BACKUP.md).
