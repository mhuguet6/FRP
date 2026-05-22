-- ============================================================================
-- Actualiza el Campus activo a las fechas de 2026.
-- También actualiza el seed por defecto en futuras instalaciones.
-- ============================================================================

update campus_edicion
set nombre = 'Campus FRP Julio 2026',
    fecha_inicio = '2026-07-05',
    fecha_fin = '2026-07-16',
    fechas_llamada_familias = array[
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
      '2026-07-14'
    ]::date[]
where activa = true;
