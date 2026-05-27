-- ============================================================================
-- Wipe profundo + recreación del usuario clienta.
--
-- Borra TODO rastro del email en TODAS las tablas auth.* (no solo auth.users)
-- y vuelve a crear el usuario desde cero. Diagnóstico y fix en un solo script.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ANTES: ¿qué hay en cada tabla auth.* asociado al email/uid?
--    Si alguno sale > 0 después de los DELETE de abajo, esa tabla tiene una FK
--    que no cascadea y bloquea el limpio.
-- ----------------------------------------------------------------------------

select 'before — auth.users'           as t, count(*) from auth.users           where lower(email) = 'mhuguet@robotix.es'
union all
select 'before — auth.identities',     count(*)                              from auth.identities i
   join auth.users u on u.id = i.user_id where lower(u.email) = 'mhuguet@robotix.es';

-- ----------------------------------------------------------------------------
-- 2) Wipe profundo: bajamos por todas las tablas auth.* que conozco.
--    Algunas pueden no existir en versiones viejas; el `do $$ ... $$;` lo
--    encapsula con manejo de errores para que no aborte.
-- ----------------------------------------------------------------------------

do $$
declare
  v_email text := 'mhuguet@robotix.es';
  v_old_ids uuid[];
begin
  -- Recoger todos los user_id históricos asociados a ese email
  select coalesce(array_agg(id), '{}') into v_old_ids
  from auth.users where lower(email) = v_email;

  raise notice 'user_ids a limpiar: %', v_old_ids;

  -- Borrar manualmente de tablas hijas (defensa contra FKs sin CASCADE)
  -- auth.refresh_tokens.user_id es VARCHAR en Supabase, no uuid → comparar como texto
  begin execute 'delete from auth.refresh_tokens where user_id = any($1::text[])' using v_old_ids; exception when others then raise notice 'refresh_tokens: %', sqlerrm; end;
  begin execute 'delete from auth.sessions       where user_id = any($1)' using v_old_ids; exception when others then raise notice 'sessions: %', sqlerrm; end;
  begin execute 'delete from auth.mfa_factors    where user_id = any($1)' using v_old_ids; exception when others then raise notice 'mfa_factors: %', sqlerrm; end;
  begin execute 'delete from auth.mfa_challenges where factor_id in (select id from auth.mfa_factors where user_id = any($1))' using v_old_ids; exception when others then raise notice 'mfa_challenges: %', sqlerrm; end;
  begin execute 'delete from auth.one_time_tokens where user_id = any($1)' using v_old_ids; exception when others then raise notice 'one_time_tokens: %', sqlerrm; end;
  begin execute 'delete from auth.flow_state     where user_id = any($1)' using v_old_ids; exception when others then raise notice 'flow_state: %', sqlerrm; end;
  begin execute 'delete from auth.identities     where user_id = any($1)' using v_old_ids; exception when others then raise notice 'identities: %', sqlerrm; end;
  begin execute 'delete from auth.audit_log_entries where (payload->>''actor_id'') = any(select x::text from unnest($1) x)' using v_old_ids; exception when others then raise notice 'audit_log: %', sqlerrm; end;

  -- Por si quedó alguna identidad con ese email apuntando a otro user
  begin
    delete from auth.identities
    where lower((identity_data ->> 'email')) = v_email;
  exception when others then raise notice 'identities (by email): %', sqlerrm; end;

  -- Y ahora sí, borrar auth.users
  delete from auth.users where lower(email) = v_email;

  raise notice 'Wipe terminado.';
end $$;

-- ----------------------------------------------------------------------------
-- 3) Recrear desde cero con coste de hash explícito (10 rounds).
-- ----------------------------------------------------------------------------

create extension if not exists pgcrypto;

do $$
declare
  v_email text := 'mhuguet@robotix.es';
  v_password text := '123456';
  v_user_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
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

  insert into clienta_emails (email, nombre)
  values (v_email, 'Clienta')
  on conflict (email) do nothing;

  raise notice 'Clienta recreada con id %', v_user_id;
end $$;

-- ----------------------------------------------------------------------------
-- 4) DESPUÉS: verificación final.
-- ----------------------------------------------------------------------------

select 'after — auth.users'           as tabla, count(*) as filas from auth.users           where lower(email) = 'mhuguet@robotix.es'
union all
select 'after — auth.identities',      count(*) from auth.identities i
   join auth.users u on u.id = i.user_id  where lower(u.email) = 'mhuguet@robotix.es'
union all
select 'after — auth.refresh_tokens', count(*) from auth.refresh_tokens rt
   join auth.users u on u.id::text = rt.user_id where lower(u.email) = 'mhuguet@robotix.es'
union all
select 'after — auth.sessions',       count(*) from auth.sessions s
   join auth.users u on u.id = s.user_id  where lower(u.email) = 'mhuguet@robotix.es'
union all
select 'after — clienta_emails',      count(*) from clienta_emails where lower(email) = 'mhuguet@robotix.es';
