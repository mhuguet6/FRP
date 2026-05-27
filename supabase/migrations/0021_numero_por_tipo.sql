-- ============================================================================
-- Numeración independiente por tipo:
--   estudiantes → FRP-YYYY-NNN  (sin cambios respecto a 0017)
--   staff       → STF-YYYY-NNN  (contador propio dentro de la edición)
-- ============================================================================

create or replace function asignar_numero_participante()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_year int;
  v_max int;
  v_prefix text;
  v_tipo text;
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

  v_tipo := coalesce(new.tipo, 'estudiante');
  v_prefix := case when v_tipo = 'staff' then 'STF' else 'FRP' end;

  -- Contador limitado al mismo tipo dentro de la edición.
  select coalesce(
    max(
      nullif(
        regexp_replace(numero_participante, '^' || v_prefix || '-\d{4}-', ''),
        ''
      )::int
    ),
    0
  ) + 1
  into v_max
  from expedientes
  where edicion_id = new.edicion_id
    and tipo = v_tipo
    and numero_participante is not null
    and numero_participante like v_prefix || '-%';

  new.numero_participante := v_prefix || '-' || v_year || '-' || lpad(v_max::text, 3, '0');
  return new;
end;
$$;
