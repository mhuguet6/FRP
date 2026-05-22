-- ============================================================================
-- Confirmación de derechos de imagen
--
-- Cuando una familia marca "No autorizo" o "Autorizo parcialmente" en la
-- pregunta de derechos de imagen, el equipo debe contactarles para confirmar
-- que entienden las implicaciones (no aparecerá en redes/web del Campus).
--
-- Estas columnas guardan cuándo y quién hizo esa confirmación.
-- ============================================================================

alter table expedientes
  add column imagen_confirmada_at timestamptz,
  add column imagen_confirmada_por text;
