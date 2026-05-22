-- ============================================================================
-- Fix: la política UPDATE de expedientes para la familia bloqueaba la
-- transición a 'enviado'. Sin WITH CHECK explícito, Postgres aplica USING
-- también a la nueva fila, así que poner estado='enviado' violaba el filtro
-- "estado not in ('enviado', ...)".
--
-- Solución: USING controla qué filas se pueden editar (no las ya enviadas),
-- WITH CHECK controla a qué estados puede llegar la familia.
-- ============================================================================

drop policy if exists "familia_update_propio_expediente" on expedientes;

create policy "familia_update_propio_expediente"
  on expedientes for update
  using (
    user_id = auth.uid()
    and estado not in ('enviado', 'validado', 'cerrado')
  )
  with check (
    user_id = auth.uid()
    and estado in ('creado', 'en_progreso', 'pendiente_de_firma', 'enviado')
  );
