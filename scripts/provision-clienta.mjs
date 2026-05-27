#!/usr/bin/env node
// ============================================================================
// Provisiona el usuario de la clienta en Supabase usando la Admin API REST.
//
// Usa `fetch()` directo en vez del SDK @supabase/supabase-js para evitar el
// problema de inicialización de Realtime en Node 20.
//
// Uso:
//   1) En .env.local debe existir:
//        VITE_SUPABASE_URL=...
//        SUPABASE_SERVICE_ROLE_KEY=...   (Dashboard → Settings → API → service_role)
//   2) node scripts/provision-clienta.mjs
// ============================================================================

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---- Cargar .env.local --------------------------------------------------
const envPath = resolve(__dirname, '..', '.env.local')
let envText = ''
try {
  envText = readFileSync(envPath, 'utf8')
} catch {
  console.error(`No encuentro .env.local en ${envPath}`)
  process.exit(1)
}
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) {
  console.error('Falta VITE_SUPABASE_URL en .env.local')
  process.exit(1)
}
if (!SERVICE_KEY) {
  console.error(
    'Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.\n' +
      'Encuéntrala en Supabase Dashboard → Project Settings → API → "service_role".'
  )
  process.exit(1)
}

const EMAIL = 'mhuguet@robotix.es'
const PASSWORD = '123456'

const baseHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function call(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...baseHeaders, ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  return { ok: res.ok, status: res.status, body }
}

async function createUser() {
  const r = await call('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { rol: 'clienta' },
    }),
  })
  if (!r.ok) {
    // Si el usuario ya existe, indicar al user que tiene que borrarlo por SQL
    if (r.status === 422) {
      throw new Error(
        `El usuario ya existe en auth.users y la Admin API no puede borrarlo (listUsers da 500).\n` +
          `   → Corre primero este SQL en el SQL Editor y vuelve a lanzar el script:\n` +
          `       delete from auth.users where lower(email) = '${EMAIL}';\n\n` +
          `   Respuesta original: ${JSON.stringify(r.body)}`
      )
    }
    throw new Error(`createUser status ${r.status}: ${JSON.stringify(r.body)}`)
  }
  return r.body
}

async function upsertClientaEmail() {
  const r = await call('/rest/v1/clienta_emails', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ email: EMAIL, nombre: 'Clienta' }),
  })
  if (!r.ok)
    throw new Error(
      `upsert clienta_emails status ${r.status}: ${JSON.stringify(r.body)}`
    )
}

async function main() {
  console.log('→ Creando usuario via Admin API...')
  const created = await createUser()
  console.log(`✓ Usuario creado: id=${created.id}`)

  console.log('→ Asegurando fila en clienta_emails...')
  await upsertClientaEmail()
  console.log('✓ clienta_emails listo.')

  console.log('\n────────────────────────────────────')
  console.log('Listo. Entra en la app con:')
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log('────────────────────────────────────')
}

main().catch((e) => {
  console.error('✗ Error:', e.message || e)
  process.exit(1)
})
