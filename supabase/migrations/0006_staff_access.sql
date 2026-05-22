-- ============================================================================
-- Acceso del equipo (staff) a expedientes de todas las familias.
--
-- Sin login interno separado: el staff usa el mismo magic link que las familias.
-- Si su email está en `staff_emails`, RLS le concede lectura sobre todo.
-- ============================================================================

create table staff_emails (
  email text primary key,
  rol text not null default 'admin' check (rol in ('admin', 'gestor', 'lectura')),
  created_at timestamptz not null default now()
);

alter table staff_emails enable row level security;

-- El propio staff puede ver la tabla (para "soy staff?")
create policy "staff_select_self"
  on staff_emails for select
  using (email = auth.jwt() ->> 'email');

-- Seed inicial: tech@robotix.es como admin
insert into staff_emails (email, rol)
values ('tech@robotix.es', 'admin')
on conflict (email) do nothing;

-- Helper: ¿soy staff?
create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_emails s
    where s.email = (auth.jwt() ->> 'email')
  );
$$;

-- ============================================================================
-- Políticas de lectura para staff
-- ============================================================================

create policy "staff_select_todos_expedientes"
  on expedientes for select
  using (is_staff());

create policy "staff_select_todas_medicaciones"
  on medicaciones for select
  using (is_staff());

create policy "staff_select_todas_firmas"
  on firmas for select
  using (is_staff());

create policy "staff_select_todos_documentos"
  on documentos for select
  using (is_staff());

create policy "staff_select_todos_eventos"
  on eventos for select
  using (is_staff());

create policy "staff_select_recordatorios"
  on recordatorios for select
  using (is_staff());

-- ============================================================================
-- Acceso a Storage para staff
-- ============================================================================

create policy "staff_storage_firmas_read"
  on storage.objects for select
  using (bucket_id = 'firmas' and is_staff());

create policy "staff_storage_documentos_read"
  on storage.objects for select
  using (bucket_id = 'documentos' and is_staff());
