-- Хранилище Node-сервиса med-technika (вариант А: SecureApi + Postgres).
-- Сервис создаёт эти таблицы сам при старте; файл — для ручного наката/ревью.
--
-- Схема medtech НЕ публикуется через PostgREST (в Supabase exposed schemas
-- по умолчанию только public/graphql_public) → anon/authenticated к данным
-- доступа не имеют. Подключается только сервис по DATABASE_URL.

create schema if not exists medtech;

-- Все таблицы приложения одной строкой (jsonb), перезаписываются после мутации.
create table if not exists medtech.app_state (
  id smallint primary key default 1 check (id = 1),
  version integer not null default 1,
  tables jsonb not null,
  updated_at timestamptz not null default now()
);

-- Файлы: исходники Excel, PDF-сканы, XML-выгрузки. Пишутся инкрементально.
create table if not exists medtech.app_blobs (
  kind text not null check (kind in ('protocol_source', 'protocol_scan', 'fgis_export')),
  path text not null,
  meta jsonb not null,
  bytes bytea,
  updated_at timestamptz not null default now(),
  primary key (kind, path)
);
