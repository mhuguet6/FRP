-- ============================================================================
-- El staff (admin de Robotix) necesita poder subir/cambiar/borrar archivos
-- en los buckets `firmas` y `documentos` para los flujos de "Editar
-- formulario completo" desde /admin/expediente/:id/editar.
--
-- Hasta ahora solo tenía SELECT (migración 0006). Si subía una foto del
-- niño desde modo admin, Supabase devolvía:
--   "new row violates row-level security policy"
--
-- Esta migración añade INSERT, UPDATE y DELETE en storage.objects para los
-- dos buckets que usamos.
-- ============================================================================

create policy "staff_storage_firmas_write"
  on storage.objects for insert
  with check (bucket_id = 'firmas' and is_staff());

create policy "staff_storage_firmas_update"
  on storage.objects for update
  using (bucket_id = 'firmas' and is_staff())
  with check (bucket_id = 'firmas' and is_staff());

create policy "staff_storage_firmas_delete"
  on storage.objects for delete
  using (bucket_id = 'firmas' and is_staff());

create policy "staff_storage_documentos_write"
  on storage.objects for insert
  with check (bucket_id = 'documentos' and is_staff());

create policy "staff_storage_documentos_update"
  on storage.objects for update
  using (bucket_id = 'documentos' and is_staff())
  with check (bucket_id = 'documentos' and is_staff());

create policy "staff_storage_documentos_delete"
  on storage.objects for delete
  using (bucket_id = 'documentos' and is_staff());
