-- ============================================================================
-- Provisión del usuario de auth para la clienta.
--
-- Crea (de forma idempotente) el usuario `mhuguet@robotix.es` con password
-- `123456` y email auto-confirmado, equivalente a "Add User" desde el
-- dashboard de Supabase Auth.
--
-- Es una credencial de desarrollo. En producción cámbiala con:
--   update auth.users
--   set encrypted_password = crypt('<nuevo password>', gen_salt('bf'))
--   where lower(email) = 'mhuguet@robotix.es';
-- ============================================================================

create extension if not exists pgcrypto;

do $$
declare
  v_email text := 'mhuguet@robotix.es';
  v_password text := '123456';
  v_user_id uuid;
begin
  -- Si ya existe, no tocar (idempotente).
  select id into v_user_id from auth.users where lower(email) = v_email;
  if v_user_id is not null then
    return;
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );
end $$;
