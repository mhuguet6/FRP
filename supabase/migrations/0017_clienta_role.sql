-- ============================================================================
-- Rol "clienta": la persona externa que aporta la lista de niños inscritos.
--
-- Flujo soportado:
--   1) Clienta entra en /clienta con email+password (provisionado a mano
--      en Supabase Auth Dashboard — ver instrucciones al final).
--   2) Crea expedientes uno a uno (form) o sube un Excel.
--   3) Al crear el expediente también se crea una `invitaciones` row con
--      `expediente_id` apuntando al expediente (enviada_at = null).
--   4) El admin marca pagado en /admin y pulsa "Enviar formulario", lo que
--      manda el magic link y marca enviada_at en la invitación.
--   5) Al loguearse, `reclamar_invitaciones()` enlaza user_id al expediente
--      pre-existente (en lugar de crear uno nuevo).
--
-- Cambios incluidos en esta migración:
--   - Tabla `clienta_emails` + función `is_clienta()`
--   - RLS para que la clienta opere en expedientes / invitaciones /
--     datos_clienta de su edición activa
--   - Columna `numero_participante` con trigger BEFORE INSERT que genera
--     un código humano legible "FRP-YYYY-NNN" por edición.
--   - `expedientes.user_id` pasa a NULL (clienta crea sin user_id; se
--     enlaza cuando la familia entra por el magic link).
--   - `reclamar_invitaciones()` actualizado: si la invitación ya apunta a
--     un expediente, solo enlaza user_id en ese expediente en vez de
--     crear uno nuevo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla y función de rol
-- ----------------------------------------------------------------------------

create table clienta_emails (
  email text primary key,
  nombre text,
  created_at timestamptz default now()
);

alter table clienta_emails enable row level security;

create policy "auth_can_check_clienta_emails"
  on clienta_emails for select
  using (auth.role() = 'authenticated');

create or replace function is_clienta() returns boolean
language sql security definer
set search_path = public
as $$
  select exists (
    select 1 from clienta_emails
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

grant execute on function is_clienta() to authenticated;

-- ----------------------------------------------------------------------------
-- RLS para clienta — opera dentro de su edición. KISS: mismo alcance que
-- staff sobre expedientes / invitaciones / datos_clienta.
-- ----------------------------------------------------------------------------

create policy "clienta_select_expedientes"
  on expedientes for select
  using (is_clienta());

create policy "clienta_insert_expedientes"
  on expedientes for insert
  with check (is_clienta());

create policy "clienta_update_expedientes"
  on expedientes for update
  using (is_clienta())
  with check (is_clienta());

create policy "clienta_delete_expedientes"
  on expedientes for delete
  using (is_clienta() and submitted_at is null);

create policy "clienta_all_invitaciones"
  on invitaciones for all
  using (is_clienta())
  with check (is_clienta());

create policy "clienta_all_datos_clienta"
  on datos_clienta for all
  using (is_clienta())
  with check (is_clienta());

-- ----------------------------------------------------------------------------
-- user_id nullable: la clienta crea expedientes antes de que exista user.
-- La columna se rellena en reclamar_invitaciones() cuando la familia entra.
-- ----------------------------------------------------------------------------

alter table expedientes alter column user_id drop not null;

-- ----------------------------------------------------------------------------
-- numero_participante: identificador humano legible por edición.
-- Formato: FRP-YYYY-NNN (ej. FRP-2026-001).
-- ----------------------------------------------------------------------------

alter table expedientes
  add column numero_participante text;

create unique index expedientes_numero_unico
  on expedientes(edicion_id, numero_participante)
  where numero_participante is not null;

create or replace function asignar_numero_participante()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_year int;
  v_max int;
begin
  if new.numero_participante is not null then
    return new;
  end if;
  if new.edicion_id is null then
    return new;
  end if;

  select extract(year from fecha_inicio)::int into v_year
  from campus_edicion
  where id = new.edicion_id;

  if v_year is null then
    return new;
  end if;

  select coalesce(
    max(
      nullif(
        regexp_replace(numero_participante, '^FRP-\d{4}-', ''),
        ''
      )::int
    ),
    0
  ) + 1
  into v_max
  from expedientes
  where edicion_id = new.edicion_id
    and numero_participante is not null;

  new.numero_participante := 'FRP-' || v_year || '-' || lpad(v_max::text, 3, '0');
  return new;
end;
$$;

create trigger trg_asignar_numero_participante
  before insert on expedientes
  for each row execute function asignar_numero_participante();

-- ----------------------------------------------------------------------------
-- reclamar_invitaciones(): nuevo comportamiento.
--   - Si la invitación tiene expediente_id pre-rellenado → enlaza user_id en
--     ese expediente (y graba datos_clienta si la invitación trae datos).
--   - Si no → crea expediente nuevo como antes.
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
    for update skip locked
  loop
    if v_inv.expediente_id is not null then
      -- Expediente pre-creado por la clienta: solo enlazar usuario.
      update expedientes
      set user_id = v_user_id,
          -- Recordamos tutor_email en el expediente por consistencia.
          tutor_email = coalesce(tutor_email, v_inv.email)
      where id = v_inv.expediente_id
        and user_id is null;

      v_exp_id := v_inv.expediente_id;
    else
      -- Camino legacy: crear expediente desde la invitación.
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

      if v_inv.datos_clienta is not null and v_inv.datos_clienta != '{}'::jsonb then
        insert into datos_clienta (expediente_id, datos)
        values (v_exp_id, v_inv.datos_clienta);
      end if;
    end if;

    update invitaciones
    set reclamada_at = now(), expediente_id = v_exp_id
    where id = v_inv.id;

    expediente_id := v_exp_id;
    return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Provisión de la clienta inicial. La fila aquí solo da permiso de rol;
-- el usuario en auth.users se crea desde Supabase Auth Dashboard:
--   Dashboard → Authentication → Add User
--   Email: mhuguet@robotix.es
--   Password: 123456
--   Auto-confirm: Yes
-- ----------------------------------------------------------------------------

insert into clienta_emails (email, nombre)
values ('mhuguet@robotix.es', 'Clienta — Marc Huguet')
on conflict (email) do nothing;
