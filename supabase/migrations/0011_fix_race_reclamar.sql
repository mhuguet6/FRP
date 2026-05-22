-- ============================================================================
-- Fix: race condition en reclamar_invitaciones()
--
-- Si la función se llama dos veces concurrentemente (por ejemplo cuando el
-- cliente React monta el efecto dos veces en dev, o por una recarga rápida),
-- ambas llamadas hacían SELECT antes de que ninguna marcara reclamada_at,
-- así que las dos pasaban a crear expedientes. Resultado: duplicados.
--
-- Arreglo: usamos `FOR UPDATE SKIP LOCKED` para que la primera llamada que
-- "tome" cada invitación impida que las concurrentes la procesen.
-- ============================================================================

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

    update invitaciones
    set reclamada_at = now(), expediente_id = v_exp_id
    where id = v_inv.id;

    expediente_id := v_exp_id;
    return next;
  end loop;
end;
$$;
