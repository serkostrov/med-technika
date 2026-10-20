# Деплой на сервер

## Архитектура (честно)

| Слой | Сейчас | Цель |
|------|--------|------|
| UI | React SPA (`dist/`) | без изменений |
| Бизнес-логика | portable `SecureApi` в браузере (in-memory) | тот же код на Node/Edge + Postgres |
| Справочники / seed | TypeScript → **SQL** (`npm run seed:sql`) | Postgres |
| Персист браузера | `localStorage` (`mt.db.v1`), logout **не** стирает | Postgres API |
| Файлы | in-memory Maps | Supabase Storage / S3 buckets |

Полный перенос RPC на Postgres — отдельный этап. Этот документ закрывает **миграции, seed, env и выкладку SPA**.

## Env

```bash
cp .env.example .env
```

| Переменная | Назначение |
|------------|------------|
| `VITE_APP_ENV` | `local` / `staging` / `production` |
| `VITE_PERSIST_LOCAL_DB` | `true` для portable SPA (данные переживают logout); `false` только с Postgres API |
| `VITE_SUPABASE_*` | опционально, если подключите Supabase |

Секреты (`SUPABASE_SERVICE_ROLE_KEY`) **не** коммитить.

## Подготовка БД (опционально)

```bash
npm run seed:sql
npm run docker:db          # локальный Postgres + migrations + seed
# или: supabase db reset
```

Файлы `*.dev.sql` содержат тестовые учётки — **не** накатывать на боевой прод без смены паролей.

## Сборка SPA для сервера

```bash
export VITE_APP_ENV=production
export VITE_PERSIST_LOCAL_DB=true
npm ci
npm run build
# раздавайте dist/ через Nginx/Caddy (SPA fallback → index.html)
```

Docker-образ по умолчанию передаёт `VITE_PERSIST_LOCAL_DB=true`:

```bash
npm run docker:up
# http://localhost:8080
```

HTTPS — на reverse proxy перед контейнером.

## Dokploy

1. **Application** → Git-репозиторий проекта.  
2. **Build Type** = `Dockerfile`.  
3. **Dockerfile path** = `Dockerfile` (корень репо).  
4. **Docker context** = `.`  
5. **Port** = `80` (при создании домена тоже 80).  
6. **Build Arguments** (не runtime env — Vite вшивает на сборке):

```text
VITE_APP_ENV=production
VITE_PERSIST_LOCAL_DB=true
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

7. Deploy. Healthcheck: `GET /healthz` → `ok`.

Файлы: корневой `Dockerfile`, nginx — `docker/nginx.dokploy.conf`, игнор контекста — `.dockerignore`.

## sessionStorage / localStorage

| Ключ | Где | Что |
|------|-----|-----|
| `mt.db.v1` | **localStorage** | снимок in-memory БД (справочники, протоколы). Logout **не** удаляет |
| `mt.access_token` | sessionStorage | токен сессии входа |
| `mt.session` | sessionStorage | email/role/staffId для UI |

`VITE_PERSIST_LOCAL_DB=false` — не писать `mt.db.v1` (только когда появится Postgres API).

## Checklist перед заливкой

1. [ ] `.env` на сервере без `*.dev` паролей в проде  
2. [ ] `npm run seed:sql` и миграции накатили на Postgres  
3. [ ] `VITE_PERSIST_LOCAL_DB=true` в build args (portable SPA)  
4. [ ] `npm test && npm run build` зелёные  
5. [ ] Backup cron по [ops/BACKUP.md](ops/BACKUP.md)  
6. [ ] Reverse proxy + TLS  

## Следующий этап (Postgres runtime)

1. Node/Edge API, который поднимает `SecureApi` над `pg` вместо `createEmptyDatabase()`.  
2. Auth через `auth_accounts` / Supabase Auth.  
3. Файлы в Storage buckets из `config.toml`.  
4. SPA ходит на HTTP API, а не в in-process handler.
