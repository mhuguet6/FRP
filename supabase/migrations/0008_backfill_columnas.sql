-- ============================================================================
-- Backfill: rellenar columnas indexables desde `respuestas` jsonb cuando
-- estén NULL.
--
-- Causa: el autosave era debounced y se cancelaba si la familia avanzaba
-- de sección antes de los 1.5s. La columna quedaba NULL aunque la respuesta
-- estuviera en el JSON. (Ya está corregido en el código vía flush on unmount.)
-- ============================================================================

update expedientes
set tiene_alergias = case
  when respuestas #>> '{seccion3,alergias,respuesta}' = 'si' then true
  when respuestas #>> '{seccion3,alergias,respuesta}' = 'no' then false
  else tiene_alergias
end
where tiene_alergias is null
  and respuestas #>> '{seccion3,alergias,respuesta}' is not null;

update expedientes
set detalle_alergias = respuestas #>> '{seccion3,alergias,que}'
where detalle_alergias is null
  and respuestas #>> '{seccion3,alergias,respuesta}' = 'si'
  and respuestas #>> '{seccion3,alergias,que}' is not null;

update expedientes
set tiene_medicacion = case
  when respuestas #>> '{seccion4,durante_campus,respuesta}' = 'si' then true
  when respuestas #>> '{seccion4,durante_campus,respuesta}' = 'no' then false
  else tiene_medicacion
end
where tiene_medicacion is null
  and respuestas #>> '{seccion4,durante_campus,respuesta}' is not null;

update expedientes
set alumno_nombre = respuestas #>> '{seccion1,nombre}'
where alumno_nombre is null
  and respuestas #>> '{seccion1,nombre}' is not null;

update expedientes
set alumno_apellidos = respuestas #>> '{seccion1,apellidos}'
where alumno_apellidos is null
  and respuestas #>> '{seccion1,apellidos}' is not null;

update expedientes
set fecha_nacimiento = (respuestas #>> '{seccion1,fecha_nacimiento}')::date
where fecha_nacimiento is null
  and respuestas #>> '{seccion1,fecha_nacimiento}' is not null
  and respuestas #>> '{seccion1,fecha_nacimiento}' ~ '^\d{4}-\d{2}-\d{2}$';

update expedientes
set tutor_nombre = respuestas #>> '{seccion2,tutor_nombre}'
where tutor_nombre is null
  and respuestas #>> '{seccion2,tutor_nombre}' is not null;

update expedientes
set tutor_dni = respuestas #>> '{seccion2,tutor_dni}'
where tutor_dni is null
  and respuestas #>> '{seccion2,tutor_dni}' is not null;

update expedientes
set tutor_email = respuestas #>> '{seccion2,email_contacto}'
where tutor_email is null
  and respuestas #>> '{seccion2,email_contacto}' is not null;

update expedientes
set tutor_telefono = respuestas #>> '{seccion2,contactos,0,telefono}'
where tutor_telefono is null
  and respuestas #>> '{seccion2,contactos,0,telefono}' is not null;

update expedientes
set curso = respuestas #>> '{seccion5,participante,curso}'
where curso is null
  and respuestas #>> '{seccion5,participante,curso}' is not null;
