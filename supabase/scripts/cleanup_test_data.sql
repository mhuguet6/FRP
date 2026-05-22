-- ============================================================================
-- CLEANUP DE DATOS DE PRUEBA
--
-- ⚠️ DESTRUCTIVO ⚠️
-- Borra TODOS los expedientes, invitaciones y usuarios excepto
-- marc.huguet.e@gmail.com (el admin principal).
--
-- Úsalo solo en entorno de prueba o cuando quieras resetear el sistema desde
-- cero para volver a probar el flujo de invitaciones de extremo a extremo.
--
-- IMPORTANTE: el ORDEN importa. invitaciones tiene una FK a expedientes
-- (aunque sea ON DELETE SET NULL desde la migración 0012, aquí borramos
-- todo en orden seguro independientemente).
--
-- NOTA: Los archivos de Storage (buckets `firmas` y `documentos`) NO se borran
-- desde aquí porque Supabase bloquea el DELETE directo sobre storage.objects.
-- Quedan huérfanos pero no rompen nada. Si quieres limpiarlos, ve a:
--   Dashboard → Storage → bucket → seleccionar archivos → Delete
-- ============================================================================

begin;

-- 1. Invitaciones primero (no tiene dependencias hacia ella)
delete from invitaciones;

-- 2. Expedientes y todo lo que depende de ellos
--    (medicaciones, firmas, documentos, eventos, recordatorios y datos_clienta
--     desaparecen vía ON DELETE CASCADE)
delete from expedientes;

-- 3. Staff: solo dejamos marc.huguet.e@gmail.com
delete from staff_emails where email != 'marc.huguet.e@gmail.com';

-- 4. Usuarios de auth.users (excepto admin)
delete from auth.users where email != 'marc.huguet.e@gmail.com';

commit;

-- Verificación opcional (descomenta y ejecuta por separado si quieres ver el estado):
-- select 'expedientes' as tabla, count(*) from expedientes
-- union all select 'invitaciones', count(*) from invitaciones
-- union all select 'auth.users', count(*) from auth.users
-- union all select 'staff_emails', count(*) from staff_emails
-- union all select 'firmas', count(*) from firmas
-- union all select 'documentos', count(*) from documentos;
