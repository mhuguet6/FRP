-- ============================================================================
-- Permitir al staff insertar expedientes (alta manual de miembros del equipo
-- desde /admin/staff/nuevo). Hasta ahora el staff solo podía actualizar.
-- ============================================================================

create policy "staff_insert_expedientes"
  on expedientes for insert
  with check (is_staff());

-- También permitimos delete por si en el futuro hay que retirar staff
-- erróneamente creados (no afecta a expedientes con submitted_at por la
-- lógica de cliente; aquí solo aseguramos el permiso de RLS).
create policy "staff_delete_expedientes"
  on expedientes for delete
  using (is_staff());
