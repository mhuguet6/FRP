-- ============================================================================
-- FRP - Migración inicial
-- Esquema base: expedientes, medicación, firmas, documentos, eventos,
-- recordatorios. RLS para que cada familia solo vea sus expedientes.
-- ============================================================================

-- Enum de estados del expediente
create type expediente_estado as enum (
  'creado',
  'en_progreso',
  'pendiente_de_firma',
  'enviado',
  'validado',
  'requiere_correccion',
  'cerrado'
);

-- ----------------------------------------------------------------------------
-- expedientes: una fila por niño/a inscrito. Un tutor (auth.users) puede
-- tener varios (hermanos).
-- ----------------------------------------------------------------------------
create table expedientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  estado expediente_estado not null default 'creado',

  -- Campos indexables (los que se cruzan en docs agregados / listados).
  -- El resto de respuestas viven en `respuestas` (jsonb).
  alumno_nombre text,
  alumno_apellidos text,
  tutor_nombre text,
  tutor_email text,
  tutor_telefono text,
  tiene_alergias boolean,
  detalle_alergias text,
  tiene_medicacion boolean,

  respuestas jsonb not null default '{}'::jsonb,
  current_section int not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  validated_at timestamptz
);

create index expedientes_user_id_idx on expedientes(user_id);
create index expedientes_estado_idx on expedientes(estado);
create index expedientes_tiene_alergias_idx on expedientes(tiene_alergias) where tiene_alergias is true;

-- ----------------------------------------------------------------------------
-- medicaciones: 0..N por expediente
-- ----------------------------------------------------------------------------
create table medicaciones (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references expedientes(id) on delete cascade,
  nombre text not null,
  dosis text,
  frecuencia text,
  observaciones text,
  created_at timestamptz not null default now()
);

create index medicaciones_expediente_id_idx on medicaciones(expediente_id);

-- ----------------------------------------------------------------------------
-- firmas: 0..1 por expediente (solo cuando hay medicación)
-- ----------------------------------------------------------------------------
create table firmas (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null unique references expedientes(id) on delete cascade,
  storage_path text not null,            -- bucket: 'firmas'
  firmado_por text not null,             -- nombre del tutor
  texto_autorizacion text not null,      -- snapshot inmutable de lo firmado
  firmado_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- documentos: adjuntos subidos por la familia (foto, DNI, etc.)
-- ----------------------------------------------------------------------------
create table documentos (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references expedientes(id) on delete cascade,
  tipo text not null,                    -- 'foto', 'dni', etc.
  storage_path text not null,            -- bucket: 'documentos'
  nombre_original text,
  mime_type text,
  size_bytes int,
  created_at timestamptz not null default now()
);

create index documentos_expediente_id_idx on documentos(expediente_id);

-- ----------------------------------------------------------------------------
-- eventos: historial inmutable del expediente
-- ----------------------------------------------------------------------------
create table eventos (
  id bigserial primary key,
  expediente_id uuid not null references expedientes(id) on delete cascade,
  tipo text not null,                    -- 'creado', 'magic_link_enviado', 'firmado', 'enviado', etc.
  payload jsonb not null default '{}'::jsonb,
  actor text,                            -- 'familia' | 'sistema' | email del staff
  created_at timestamptz not null default now()
);

create index eventos_expediente_id_idx on eventos(expediente_id);

-- ----------------------------------------------------------------------------
-- recordatorios: programados y/o enviados
-- ----------------------------------------------------------------------------
create table recordatorios (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references expedientes(id) on delete cascade,
  tipo text not null,                    -- 'no_abierto', 'no_terminado', 'falta_firma', 'correccion'
  programado_para timestamptz not null,
  enviado_at timestamptz,
  created_at timestamptz not null default now()
);

create index recordatorios_pendientes_idx on recordatorios(programado_para) where enviado_at is null;

-- ============================================================================
-- Trigger: updated_at automático en expedientes
-- ============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger expedientes_updated_at
  before update on expedientes
  for each row execute function set_updated_at();

-- ============================================================================
-- Row Level Security
-- La familia (auth.users) solo ve/edita sus propios expedientes.
-- El backoffice todavía no tiene RLS — accederá con service_role temporalmente
-- y lo blindamos antes de deployar.
-- ============================================================================

alter table expedientes enable row level security;
alter table medicaciones enable row level security;
alter table firmas enable row level security;
alter table documentos enable row level security;
alter table eventos enable row level security;
alter table recordatorios enable row level security;

-- expedientes: familia ve y edita los suyos
create policy "familia_select_propio_expediente"
  on expedientes for select
  using (user_id = auth.uid());

create policy "familia_insert_propio_expediente"
  on expedientes for insert
  with check (user_id = auth.uid());

create policy "familia_update_propio_expediente"
  on expedientes for update
  using (user_id = auth.uid() and estado not in ('enviado', 'validado', 'cerrado'));

-- medicaciones: ligadas a expediente del usuario
create policy "familia_crud_medicaciones_propias"
  on medicaciones for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = expediente_id and e.user_id = auth.uid()
    )
  );

-- firmas: misma lógica
create policy "familia_crud_firma_propia"
  on firmas for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = expediente_id and e.user_id = auth.uid()
    )
  );

-- documentos: misma lógica
create policy "familia_crud_documentos_propios"
  on documentos for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = expediente_id and e.user_id = auth.uid()
    )
  );

-- eventos: familia puede leer su historial, no escribirlo (lo escribe el server)
create policy "familia_select_eventos_propios"
  on eventos for select
  using (
    exists (
      select 1 from expedientes e
      where e.id = expediente_id and e.user_id = auth.uid()
    )
  );

-- recordatorios: la familia no necesita verlos
-- (sin policy → nadie con anon/auth puede acceder; solo service_role)

-- ============================================================================
-- Storage buckets
-- ============================================================================
insert into storage.buckets (id, name, public)
values
  ('firmas', 'firmas', false),
  ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Política de Storage: la familia sube/lee archivos dentro de su carpeta
-- `expedientes/<expediente_id>/...` solo si el expediente es suyo.
create policy "familia_storage_firmas"
  on storage.objects for all
  using (
    bucket_id = 'firmas'
    and exists (
      select 1 from expedientes e
      where e.id::text = (storage.foldername(name))[1]
        and e.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'firmas'
    and exists (
      select 1 from expedientes e
      where e.id::text = (storage.foldername(name))[1]
        and e.user_id = auth.uid()
    )
  );

create policy "familia_storage_documentos"
  on storage.objects for all
  using (
    bucket_id = 'documentos'
    and exists (
      select 1 from expedientes e
      where e.id::text = (storage.foldername(name))[1]
        and e.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'documentos'
    and exists (
      select 1 from expedientes e
      where e.id::text = (storage.foldername(name))[1]
        and e.user_id = auth.uid()
    )
  );
