-- ============================================================================
-- Tipo de expediente: estudiante o staff.
--
-- Diferenciamos en la misma tabla `expedientes` entre los niños inscritos
-- (que carga la clienta y rellena la familia) y el equipo del Campus
-- (creación TBD — por ahora solo soportamos el filtrado y la posibilidad
-- de almacenar). Los exports de PDF respetan esta clasificación: si filtras
-- por "Staff" + "Robótica" y pulsas "Médico", obtienes la hoja médica
-- únicamente del equipo de Robótica.
--
-- Las filas existentes pasan a `'estudiante'` (default).
-- ============================================================================

alter table expedientes
  add column tipo text not null default 'estudiante'
    check (tipo in ('estudiante', 'staff'));

create index expedientes_tipo_idx on expedientes(tipo);
