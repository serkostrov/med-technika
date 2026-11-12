# Деплой на сервер

## Архитектура

| Слой | Как устроено |
|------|--------------|
| UI | React SPA (`dist/`), раздаётся тем же Node-сервисом |
| API | Node-сервис `src/server/node/` → `SecureApi` (вся бизнес-логика, права, проверки), маршруты `/api/*` |
| Данные | Postgres из Supabase, схема `medtech` (`supabase/migrations/003_app_state.sql`) |
| Файлы | Excel-исходники, PDF-сканы, XML-выгрузки — таблица `medtech.app_blobs` (bytea) |
| Вход | учётки приложения (`authAccounts` в базе), пароли — PBKDF2, сессии 12 ч хранятся в базе |

Как хранятся данные:
- **Загрузка.** При старте сервис читает состояние из Postgres в память.
- **Запись.** После каждого изменяющего запроса сервис пишет изменения в одной транзакции:
  - таблицы — jsonb в `medtech.app_state`;
  - файлы — только новые и удалённые, в `medtech.app_blobs`.
- **Доступ.** Схема `medtech` не публикуется через PostgREST Supabase, поэтому ключи anon и authenticated её не видят. Данные доступны только сервису по `DATABASE_URL`.
- **Сбой записи.** Если база недоступна, запрос получает ответ 503 «Изменение не сохранено». Следующее сохранение повторит запись.

Сервис рассчитан на **один экземпляр** (одна реплика): состояние держится в памяти процесса.

## Переменные окружения (Dokploy → Environment)

| Переменная | Обязательно | Назначение |
|------------|-------------|------------|
| `DATABASE_URL` | да | `postgres://postgres:<POSTGRES_PASSWORD>@<хост-БД>:5432/postgres` |
| `DATABASE_SSL` | нет | `true`, если Postgres снаружи и требует TLS |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | на первом запуске | первая учётка начальника ИЛ. Используется **только на пустой базе**, потом игнорируется |
| `ALLOW_DEMO_ACCOUNTS` | нет | `true` — на пустой базе создать демо-учётки вместо `INITIAL_ADMIN_*` (только тестовый стенд) |
| `PORT` | нет | по умолчанию 80 |
| `MAX_BODY_MB` | нет | лимит запроса, по умолчанию 300 (восстановление бэкапа) |

Build-аргумент `VITE_API_BASE` по умолчанию равен `/api`. Если задать его пустым, соберётся старый портативный SPA, который хранит данные в браузере.

Секреты (`DATABASE_URL`, пароли) **не коммитить**. Задавайте их только в Dokploy.

Демо-учётки (`head@il.local` / `engineer@il.local`) на сервер **не создаются**. Если база пустая и `INITIAL_ADMIN_*` не задан, сервис не стартует.

## Dokploy

1. **Application** → Git-репозиторий, Build Type = `Dockerfile`, path = `Dockerfile`, context = `.`
2. **Port** = `80`, домен — как раньше.
3. **Environment** — `DATABASE_URL`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`.
4. Deploy. Healthcheck: `GET /healthz` → `ok`.
5. В логах должно быть `База пустая — создан начальник ИЛ …` или `Состояние загружено: …`.

### Где взять `DATABASE_URL` для Supabase в Dokploy

1. Пароль Postgres лежит в Dokploy → Supabase-стек (compose) → Environment → `POSTGRES_PASSWORD`.
2. Хост: сервис должен видеть контейнер базы по сети Docker. Посмотреть на сервере:

```bash
docker ps --format '{{.Names}}' | grep -i -E 'supabase.*db|db.*supabase'
docker inspect <имя-контейнера-db> --format '{{json .NetworkSettings.Networks}}'
```

Дальше два случая:
- **db и приложение в общей сети** (обычно `dokploy-network`): хост — имя контейнера или его alias в этой сети.
- **Сети разные:** в настройках Supabase-compose добавьте сервису `db` сеть `dokploy-network` (external), затем передеплойте Supabase-стек.

3. Пользователь — `postgres`, база — `postgres`, порт — `5432`. Подключение идёт напрямую к базе, без пулера Supavisor.

## Переезд с portable-версии (данные из браузера)

Сейчас справочники и протоколы лежат в IndexedDB браузера того компьютера, где работали.

1. **До деплоя**, в старой версии: войдите под начальником ИЛ → **Настройки → Основные → Скачать резервную копию**. Получится файл `mt-backup-YYYY-MM-DD.json`.
2. Задеплойте новую версию с переменными выше.
3. Войдите под `INITIAL_ADMIN_EMAIL`.
4. **Настройки → Основные → Восстановить из файла** → выберите JSON. Данные, учётки и файлы переедут в Postgres.
5. После восстановления действуют учётки и пароли из бэкапа. Если там были демо-пароли, **смените их**: Настройки → Пользователи.

Старые данные в IndexedDB браузера никуда не исчезают: новая версия их просто не читает.

## Резервные копии

- **Из интерфейса:** Настройки → Резервная копия (только начальник ИЛ). Это полный JSON-снимок с файлами.
- **На сервере:** `pg_dump -n medtech`. Схема небольшая, её достаточно для полного восстановления.

```bash
docker exec <db-container> pg_dump -U postgres -n medtech -Fc postgres > medtech-$(date +%F).dump
```

## Локальный запуск

```bash
npm run build:server
# без Postgres — встроенный PGlite:
MSYS_NO_PATHCONV=1 VITE_API_BASE=/api npx vite build
PGLITE_DIR=.data/pglite INITIAL_ADMIN_EMAIL=admin@lab.local INITIAL_ADMIN_PASSWORD=secret PORT=8787 npm start
# с Docker: npm run docker:up → http://localhost:8080
```

`MSYS_NO_PATHCONV=1` нужен только в Git Bash на Windows. Без него `/api` превращается в путь `C:/Program Files/Git/api`.

Без `VITE_API_BASE` команда `npm run dev` работает как раньше, в portable-режиме.

## Checklist перед заливкой

1. [ ] Скачана резервная копия из старой версии (см. «Переезд»)
2. [ ] В Dokploy заданы `DATABASE_URL`, `INITIAL_ADMIN_*`
3. [ ] `npm test && npm run build && npm run build:server` зелёные
4. [ ] После деплоя: вход, восстановление бэкапа, смена демо-паролей
5. [ ] Настроен cron на `pg_dump -n medtech`
