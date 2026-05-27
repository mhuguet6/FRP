-- ============================================================================
-- Permitir eventos "globales" (sin expediente concreto): generación de PDFs,
-- exports, acciones admin que no afectan a un niño específico.
-- ============================================================================

alter table eventos alter column expediente_id drop not null;
