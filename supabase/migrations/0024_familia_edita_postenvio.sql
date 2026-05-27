-- ============================================================================
-- Modificación de formulario por parte de la familia tras el envío.
--
-- Hasta ahora una vez `estado='enviado'` el RLS bloqueaba cualquier UPDATE
-- de la familia. La nueva política permite editar mientras el expediente
-- no esté `cerrado`. Cada edición posterior al envío bumpea
-- `modificado_postenvio_at`, que el admin ve como badge en /admin.
-- ============================================================================

drop policy if exists "familia_update_propio_expediente" on expedientes;

create policy "familia_update_propio_expediente"
  on expedientes for update
  using (
    user_id = auth.uid()
    and estado <> 'cerrado'
  )
  with check (
    user_id = auth.uid()
    and estado <> 'cerrado'
  );

alter table expedientes
  add column modificado_postenvio_at timestamptz;
