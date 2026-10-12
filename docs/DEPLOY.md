# Деплой на сервер

## Архитектура (честно)

| Слой | Сейчас | Цель |
|------|--------|------|
| UI | React SPA (`dist/`) | без изменений |
| Бизнес-логика | portable `SecureApi` в браузере (in-memory) | тот же код на Node/Edge + Postgres |
| Справочники / seed | TypeScript → **SQL** (`npm run seed:sql`) | Postgres |
| Персист браузера | `sessionStorage` только в **dev** | в production **выключен** |
| Файлы | in-memory Maps | Supabase Storage / S3 buckets |

Полный перенос RPC на Postgres — отдельный этап. Этот документ закрывает **миграции, seed, env и выкладку SPA**.

## Env

```bash
cp .env.example .env
```

| Переменная | Назначение |
|------------|------------|
| `VITE_APP_ENV` | `local` / `staging` / `production` |
| `VITE_PERSIST_LOCAL_DB` | `false` на сервере (не писать снимок БД в sessionStorage) |
| `DATABASE_URL` | Postgres для миграций / backup |
| `VITE_SUPABASE_*` | когда подключите hosted Supabase |

Секреты (`SUPABASE_SERVICE_ROLE_KEY`, пароли БД) **не** коммитить.

## Подготовка БД

```bash
# 1. Пересобрать seed из TypeScript (идемпотентно)
npm run seed:sql

# 2a. Docker Postgres (локально / staging)
npm run docker:db
# → localhost:5432, user/db mt, password change-me

# 2b. Или Supabase CLI
# supabase db reset   # migrations + seed из config.toml

# 2c. Или ручной psql
psql "$DATABASE_URL" -f supabase/migrations/001_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/002_app_auth.sql
for f in supabase/seed/00*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Файлы `*.dev.sql` содержат тестовые учётки — **не** накатывать на боевой прод без смены паролей.

## Сборка SPA для сервера

```bash
export VITE_APP_ENV=production
export VITE_PERSIST_LOCAL_DB=false
npm ci
npm run build
# раздавайте dist/ через Nginx/Caddy (SPA fallback → index.html)
```

Docker-образ уже передаёт `VITE_PERSIST_LOCAL_DB=false`:

```bash
npm run docker:up
# http://localhost:8080
```

HTTPS — на reverse proxy перед контейнером.

## sessionStorage / localStorage

| Ключ | Что | Prod |
|------|-----|------|
| `mt.db.v1` | снимок всей in-memory БД | **не пишется** при `VITE_PERSIST_LOCAL_DB=false` |
| `mt.access_token` | JWT-подобный токен сессии | только в браузере (сессия вкладки) |
| `mt.session` | email/role/staffId для UI | то же |

`localStorage` в коде **не используется**.

## Checklist перед заливкой

1. [ ] `.env` на сервере без `*.dev` паролей в проде  
2. [ ] `npm run seed:sql` и миграции накатили на Postgres  
3. [ ] `VITE_PERSIST_LOCAL_DB=false` в build args  
4. [ ] `npm test && npm run build` зелёные  
5. [ ] Backup cron по [ops/BACKUP.md](ops/BACKUP.md)  
6. [ ] Reverse proxy + TLS  

## Следующий этап (Postgres runtime)

1. Node/Edge API, который поднимает `SecureApi` над `pg` вместо `createEmptyDatabase()`.  
2. Auth через `auth_accounts` / Supabase Auth.  
3. Файлы в Storage buckets из `config.toml`.  
4. SPA ходит на HTTP API, а не в in-process handler.
