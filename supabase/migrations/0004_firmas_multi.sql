-- ============================================================================
-- firmas: permitir múltiples firmas por expediente, una por cada tipo
-- (protección de datos, vacunación, medicación, reglamento del tutor)
-- ============================================================================

alter table firmas drop constraint firmas_expediente_id_key;

alter table firmas
  add column tipo text not null default 'general';

-- Quitar el default (lo usábamos solo para columnas pre-existentes si las hubiera).
alter table firmas alter column tipo drop default;

-- Solo una firma por (expediente, tipo) — un tutor no firma dos veces lo mismo
create unique index firmas_expediente_tipo_unico on firmas(expediente_id, tipo);

-- Necesitamos política de INSERT para que la familia firme:
-- el 0001 creó una policy "for all" que ya cubre insert, mantenemos.
