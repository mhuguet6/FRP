  -- ============================================================================
  -- Gestión interna: el staff puede cambiar estado y añadir observaciones
  -- internas (no visibles a la familia).
  -- ============================================================================
  
  -- Nueva columna para notas internas
  alter table expedientes
    add column observaciones_internas text;

  -- ----------------------------------------------------------------------------
  -- RLS: staff puede modificar cualquier expediente (cambio de estado,
  -- observaciones, marcar validado, etc.)
  -- ----------------------------------------------------------------------------

  create policy "staff_update_expedientes"
    on expedientes for update
    using (is_staff())
    with check (is_staff());

  -- Staff también necesita insertar eventos para registrar sus acciones
  -- (cambio de estado, observación añadida, validación, etc.)
  create policy "staff_insert_eventos"
    on eventos for insert
    with check (is_staff());