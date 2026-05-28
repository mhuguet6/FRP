-- ============================================================================
-- Permitir al staff escribir en las tablas `firmas` y `documentos`.
-- La 0025 cerró Storage; faltaba la fila de metadata en BD.
--
-- Sin esto, cuando el admin firma en modo edición admin (o la nueva firma
-- de medicación de S3 si el admin pasa por ahí), el INSERT en `firmas`
-- falla con "new row violates row-level security policy" aunque el PNG
-- haya subido bien al bucket.
-- ============================================================================

create policy "staff_insert_firmas"
  on firmas for insert
  with check (is_staff());

create policy "staff_update_firmas"
  on firmas for update
  using (is_staff())
  with check (is_staff());

create policy "staff_delete_firmas"
  on firmas for delete
  using (is_staff());

create policy "staff_insert_documentos"
  on documentos for insert
  with check (is_staff());

create policy "staff_update_documentos"
  on documentos for update
  using (is_staff())
  with check (is_staff());

create policy "staff_delete_documentos"
  on documentos for delete
  using (is_staff());
