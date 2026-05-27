-- ============================================================================
-- Diagnóstico del login de la clienta.
--
-- Cópialo y pégalo en el SQL Editor de Supabase. La idea es ver, fila por
-- fila, qué flag está bloqueando el login. Cada columna debería decir
-- exactamente lo que pone en su comentario:
--   exists           → t   (el usuario existe)
--   password_ok      → t   (la password '123456' verifica contra el hash)
--   email_confirmed  → t   (email_confirmed_at no es NULL)
--   no_banned        → t   (banned_until es NULL o pasado)
--   no_deleted       → t   (deleted_at es NULL — si existe la columna)
--   no_sso           → t   (no es un usuario SSO)
--   has_identity     → t   (hay 1 fila en auth.identities apuntando al user)
--   identity_ok      → t   (provider='email', y provider_id coincide con user_id)
-- Si alguno sale 'f' (false), ahí está el problema.
-- ============================================================================

with u as (
  select * from auth.users where lower(email) = 'mhuguet@robotix.es'
),
i as (
  select * from auth.identities
   where user_id in (select id from u)
)
select
  exists(select 1 from u)                                          as user_exists,
  (select encrypted_password = crypt('123456', encrypted_password)
     from u)                                                       as password_ok,
  (select email_confirmed_at is not null from u)                   as email_confirmed,
  (select banned_until is null or banned_until < now() from u)     as no_banned,
  (select coalesce(
            (select deleted_at is null from u),
            true))                                                 as no_deleted_or_no_col,
  (select coalesce((select not is_sso_user from u), true))         as no_sso,
  (select coalesce((select not is_anonymous from u), true))        as no_anonymous,
  (select count(*) from i)                                         as identity_rows,
  (select bool_and(provider = 'email' and provider_id = u.id::text)
     from i, u)                                                    as identity_ok,
  (select count(*) from clienta_emails
    where lower(email) = 'mhuguet@robotix.es')                     as clienta_emails_rows;

-- ----------------------------------------------------------------------------
-- Si password_ok = f → fuerza la password de nuevo, con coste explícito.
-- Si password_ok = t pero login sigue fallando → el problema NO es el hash.
-- ----------------------------------------------------------------------------

-- Re-set forzado de la password (correr si password_ok = f arriba):
-- update auth.users
-- set encrypted_password = crypt('123456', gen_salt('bf', 10)),
--     email_confirmed_at = coalesce(email_confirmed_at, now()),
--     updated_at = now()
-- where lower(email) = 'mhuguet@robotix.es';

-- ----------------------------------------------------------------------------
-- Bonus: ¿la API de gotrue ve el usuario? Esto recupera el JSON que el
-- backend usa internamente. Mira si raw_app_meta_data tiene
-- providers=['email'] (lo necesita para aceptar signInWithPassword).
-- ----------------------------------------------------------------------------

select
  id, email, role, aud,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  encrypted_password is not null as has_hash,
  -- en algunas versiones existe esta col, en otras no:
  to_jsonb(u) - 'encrypted_password' as full_row
from auth.users u
where lower(email) = 'mhuguet@robotix.es';
