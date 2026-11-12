# ИЛ ООО «Медицинская Техника» — учёт протоколов и XML ФГИС

Веб-приложение по ТЗ v1.0 (04.10.2026): загрузка Excel-протоколов, проверки ФЛК, утверждение, сканы PDF, пакетная выгрузка XML во ФГИС.

## Быстрый старт

```bash
cp .env.example .env
npm ci
npm run dev      # http://localhost:5173
npm test
npm run build
```

Seed-учётки (локальный bootstrap): `head@il.local` / `head-test-password`, `engineer@il.local` / `engineer-test-password`.

## Документация

| Документ | Содержание |
|----------|------------|
| [docs/RUN.md](docs/RUN.md) | Запуск, Docker, миграции |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Заливка на сервер, env, Postgres |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Краткая инструкция пользователя |
| [docs/ops/BACKUP.md](docs/ops/BACKUP.md) | Backup / restore |
| [docs/ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md) | Чеклист приёмки vs ТЗ |

## Стек

- React 19 + TypeScript + Vite
- Portable domain/API (in-memory Database → Postgres/Supabase)
- SQL: `supabase/migrations/`, seed из TS: `npm run seed:sql` → `supabase/seed/`
- Production / Dokploy: корневой `Dockerfile` — Node-сервис (SPA + API `/api`), данные в Postgres Supabase (схема `medtech`). См. [docs/DEPLOY.md](docs/DEPLOY.md)
- Без `VITE_API_BASE` SPA работает в portable-режиме (данные в IndexedDB браузера)

## Скрипты

- `npm test` — unit + integration/e2e
- `npm run build` — production SPA в `dist/`
- `npm run seed:sql` — сгенерировать SQL seed из TypeScript
- `npm run build:server` — Node-сервис в `dist-server/`; `npm start` — запуск
- `npm run docker:up` — сервис + Postgres на :8080
- `npm run docker:db` — только Postgres
- `npm run backup` / `npm run restore` — шаблон снимка БД
