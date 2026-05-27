-- ============================================================================
-- Reset del login de la clienta.
--
-- Si la migración 0018 dejó el usuario en un estado raro (campos con cadena
-- vacía donde Supabase espera NULL, identity sin provider_id, etc.) este
-- script lo borra y lo vuelve a crear minimal: solo las columnas
-- imprescindibles, dejando que el resto se rellene con los defaults del
-- esquema `auth`.
--
-- Es idempotente: puedes correrlo cuantas veces quieras. Cada ejecución
-- vuelve a dejar el usuario en un estado conocido y bueno.
-- ============================================================================

create extension if not exists pgcrypto;

do $$
declare
  v_email text := 'mhuguet@robotix.es';
  v_password text := '123456';
  v_user_id uuid := gen_random_uuid();
begin
  -- 1) Wipe de cualquier rastro previo.
  --    auth.identities tiene FK con ON DELETE CASCADE → se borra solo.
  delete from auth.users where lower(email) = v_email;

  -- 2) Crear usuario con el mínimo de columnas. Lo demás → defaults.
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  -- 3) Identity. provider_id se pone igual al user_id (convención común);
  --    el unique constraint es (provider, provider_id) — así garantizamos
  --    unicidad sin colisionar con otros usuarios.
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_user_id::text,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true
    ),
    'email',
    now(),
    now(),
    now()
  );

  -- 4) Asegurar la fila en clienta_emails (necesaria para el guard del frontend).
  insert into clienta_emails (email, nombre)
  values (v_email, 'Clienta')
  on conflict (email) do nothing;

  raise notice 'Login clienta listo. Email=% / Password=% / user_id=%',
    v_email, v_password, v_user_id;
end $$;

-- ----------------------------------------------------------------------------
-- Verificación rápida: si los selects siguientes no devuelven 1 fila cada uno,
-- algo del schema de tu Supabase es distinto al esperado.
-- ----------------------------------------------------------------------------

select
  'auth.users' as tabla, count(*) as filas
from auth.users where lower(email) = 'mhuguet@robotix.es'
union all
select 'auth.identities', count(*)
from auth.identities i
join auth.users u on u.id = i.user_id
where lower(u.email) = 'mhuguet@robotix.es'
union all
select 'clienta_emails', count(*)
from clienta_emails where lower(email) = 'mhuguet@robotix.es';
