-- ============================================================================
-- Evitar invitaciones duplicadas si por error se sube el Excel varias veces.
--
-- Constraint único: solo puede haber una invitación por (edición, email,
-- nombre, apellidos). Si se reintenta el insert, falla → la app puede
-- ignorarlo o avisar.
-- ============================================================================

-- Primero limpiamos duplicados existentes (si los hay), dejando el más
-- antiguo de cada grupo.
delete from invitaciones a using invitaciones b
where a.created_at > b.created_at
  and coalesce(a.edicion_id::text, '') = coalesce(b.edicion_id::text, '')
  and lower(a.email) = lower(b.email)
  and coalesce(a.alumno_nombre, '') = coalesce(b.alumno_nombre, '')
  and coalesce(a.alumno_apellidos, '') = coalesce(b.alumno_apellidos, '');

-- Constraint único
create unique index invitaciones_unica_idx
  on invitaciones (
    coalesce(edicion_id::text, ''),
    lower(email),
    coalesce(alumno_nombre, ''),
    coalesce(alumno_apellidos, '')
  );
