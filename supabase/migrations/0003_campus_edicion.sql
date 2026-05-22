-- ============================================================================
-- Campus FRP - edición del campus (configuración por temporada)
-- y columnas extra en expedientes para datos load-bearing.
-- ============================================================================

create table campus_edicion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                       -- "Campus FRP Julio 2025"
  fecha_inicio date not null,
  fecha_fin date not null,
  fechas_llamada_familias date[] not null default '{}',  -- ej.: {2025-07-09, ..., 2025-07-14}
  activa boolean not null default false,
  created_at timestamptz not null default now()
);

-- Solo una edición activa a la vez (índice parcial único)
create unique index campus_edicion_unica_activa
  on campus_edicion (activa) where activa is true;

-- Lectura pública de la edición activa (sin auth) para mostrar fechas en el form.
alter table campus_edicion enable row level security;
create policy "lectura_publica_campus_edicion"
  on campus_edicion for select
  using (true);

-- ----------------------------------------------------------------------------
-- Vincular expedientes a una edición
-- ----------------------------------------------------------------------------
alter table expedientes
  add column edicion_id uuid references campus_edicion(id);

-- Columnas load-bearing que se usan en docs agregados y listados
alter table expedientes
  add column fecha_nacimiento date,
  add column curso text,
  add column tutor_dni text,
  add column foto_path text;            -- ruta en bucket 'documentos'

create index expedientes_edicion_id_idx on expedientes(edicion_id);

-- ----------------------------------------------------------------------------
-- Seed: edición Campus FRP Julio 2025
-- ----------------------------------------------------------------------------
insert into campus_edicion (nombre, fecha_inicio, fecha_fin, fechas_llamada_familias, activa)
values (
  'Campus FRP Julio 2025',
  '2025-07-05',
  '2025-07-16',
  array['2025-07-09', '2025-07-10', '2025-07-11', '2025-07-12', '2025-07-13', '2025-07-14']::date[],
  true
);

-- Backfill: cualquier expediente preexistente queda asociado a esta edición
update expedientes
  set edicion_id = (select id from campus_edicion where activa = true limit 1)
where edicion_id is null;
