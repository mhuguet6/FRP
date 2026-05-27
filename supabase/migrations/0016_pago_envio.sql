-- ============================================================================
-- Control de pago y envío del formulario
--
-- Flujo nuevo (preparado para la futura UI de la clienta que creará los
-- expedientes con info básica directamente):
--   1) El expediente existe con datos básicos (alumno + email del tutor).
--   2) Cuando el admin marca `pagado_at`, el expediente queda elegible para
--      recibir el magic link del formulario.
--   3) Al pulsar "Enviar formulario" en /admin, se manda el magic link al
--      tutor_email y se registra `formulario_enviado_at` para no reenviar.
--
-- Las políticas RLS de UPDATE para staff sobre `expedientes` ya existen
-- desde la migración 0009 (`staff_update_expedientes`), así que estas
-- columnas heredan ese permiso sin cambios adicionales.
-- ============================================================================

alter table expedientes
  add column pagado_at timestamptz,
  add column pagado_por text,
  add column formulario_enviado_at timestamptz,
  add column formulario_enviado_por text;
