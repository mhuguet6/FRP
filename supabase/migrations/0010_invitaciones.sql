-- ============================================================================
-- Sistema de invitaciones: la clienta nos pasa la lista de familias, el
-- staff la sube, mandamos magic link y al primer login se auto-crea el
-- expediente con los datos pre-rellenados.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Nueva columna en expedientes
-- ----------------------------------------------------------------------------

alter table expedientes
  add column programa text check (programa in ('robotica', 'emprendimiento'));

-- ----------------------------------------------------------------------------
-- Tabla `datos_clienta`: info que aporta la clienta pero que NO va al
-- formulario de la familia (chozo, importe, profesiones de los padres, etc.).
-- En tabla aparte para que la familia NO pueda leerlo aunque inspeccione.
-- ----------------------------------------------------------------------------

create table datos_clienta (
  expediente_id uuid primary key references expedientes(id) on delete cascade,
  datos jsonb not null default '{}',
  created_at timestamptz default now()
);

alter table datos_clienta enable row level security;

create policy "staff_all_datos_clienta"
  on datos_clienta for all
  using (is_staff())
  with check (is_staff());

-- (Sin política para la familia → no puede leerlo)

-- ----------------------------------------------------------------------------
-- Tabla `invitaciones`: bridge entre el Excel cargado y los expedientes
-- que se materializarán cuando la familia haga clic.
-- ----------------------------------------------------------------------------

create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  edicion_id uuid references campus_edicion(id),
  email text not null,
  -- Datos del tutor
  tutor_nombre text,
  -- Datos del alumno/a (pre-rellenarán el formulario)
  alumno_nombre text,
  alumno_apellidos text,
  fecha_nacimiento date,
  direccion text,
  programa text check (programa in ('robotica', 'emprendimiento')),
  -- Datos privados de la clienta (no entran al form, van a datos_clienta)
  datos_clienta jsonb not null default '{}',
  -- Tracking
  enviada_at timestamptz,
  reclamada_at timestamptz,
  expediente_id uuid references expedientes(id),
  error_envio text,
  created_at timestamptz not null default now()
);

create index invitaciones_email_idx on invitaciones(email);
create index invitaciones_edicion_idx on invitaciones(edicion_id);
create index invitaciones_pendientes_idx on invitaciones(reclamada_at) where reclamada_at is null;

alter table invitaciones enable row level security;

-- Staff: gestiona todo
create policy "staff_all_invitaciones"
  on invitaciones for all
  using (is_staff())
  with check (is_staff());

-- Familia: solo lee sus propias invitaciones (para que la app las muestre
-- antes de reclamarlas)
create policy "familia_select_propias_invitaciones"
  on invitaciones for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- ----------------------------------------------------------------------------
-- Función `reclamar_invitaciones()`: la familia la llama al loguearse.
-- Convierte cada invitación pendiente en un expediente pre-rellenado y la
-- marca como reclamada. Devuelve los IDs de los expedientes creados.
--
-- SECURITY DEFINER para poder escribir en datos_clienta (al que la familia
-- no tiene acceso directo).
-- ----------------------------------------------------------------------------

create or replace function reclamar_invitaciones()
returns table(expediente_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_inv record;
  v_exp_id uuid;
begin
  if v_user_id is null or v_email is null or v_email = '' then
    return;
  end if;

  for v_inv in
    select * from invitaciones
    where lower(email) = v_email
      and reclamada_at is null
    order by created_at
  loop
    -- Crear expediente con datos pre-rellenados
    insert into expedientes (
      user_id, edicion_id, estado, programa,
      alumno_nombre, alumno_apellidos, fecha_nacimiento,
      tutor_nombre, tutor_email,
      respuestas
    ) values (
      v_user_id,
      v_inv.edicion_id,
      'creado',
      v_inv.programa,
      v_inv.alumno_nombre,
      v_inv.alumno_apellidos,
      v_inv.fecha_nacimiento,
      v_inv.tutor_nombre,
      v_inv.email,
      jsonb_build_object(
        'seccion1', jsonb_build_object(
          'nombre', coalesce(v_inv.alumno_nombre, ''),
          'apellidos', coalesce(v_inv.alumno_apellidos, ''),
          'fecha_nacimiento', coalesce(v_inv.fecha_nacimiento::text, ''),
          'direccion', coalesce(v_inv.direccion, '')
        ),
        'seccion2', jsonb_build_object(
          'tutor_nombre', coalesce(v_inv.tutor_nombre, ''),
          'email_contacto', v_inv.email
        )
      )
    )
    returning id into v_exp_id;

    -- Guardar datos privados de la clienta
    if v_inv.datos_clienta is not null and v_inv.datos_clienta != '{}'::jsonb then
      insert into datos_clienta (expediente_id, datos)
      values (v_exp_id, v_inv.datos_clienta);
    end if;

    -- Marcar invitación como reclamada
    update invitaciones
    set reclamada_at = now(), expediente_id = v_exp_id
    where id = v_inv.id;

    expediente_id := v_exp_id;
    return next;
  end loop;
end;
$$;

-- La función SECURITY DEFINER necesita ser ejecutable por usuarios autenticados
grant execute on function reclamar_invitaciones() to authenticated;
