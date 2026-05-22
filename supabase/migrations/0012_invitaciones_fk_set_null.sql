-- ============================================================================
-- Fix: invitaciones.expediente_id sin ON DELETE bloqueaba `delete from
-- expedientes` cuando había invitaciones ya reclamadas.
--
-- Cambiamos la FK a ON DELETE SET NULL: si se borra un expediente, la
-- invitación se queda como "huérfana" (expediente_id pasa a NULL) pero sigue
-- existiendo como rastro de que se envió un magic link. No bloquea limpiezas.
-- ============================================================================

alter table invitaciones
  drop constraint invitaciones_expediente_id_fkey;

alter table invitaciones
  add constraint invitaciones_expediente_id_fkey
  foreign key (expediente_id)
  references expedientes(id)
  on delete set null;
