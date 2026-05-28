#!/usr/bin/env node
// ============================================================================
// Configura la caducidad de los magic links / OTP del proyecto Supabase.
//
// El dashboard de Supabase capa el valor a 86400 segundos (24h). Esta API de
// gestión sí permite valores superiores. Útil cuando las familias tardan más
// de un día en abrir el enlace.
//
// Uso:
//   1) En .env.local deben existir:
//        SUPABASE_ACCESS_TOKEN=sbp_xxx...     (Account → Access Tokens)
//        SUPABASE_PROJECT_REF=xxxxxxxxxx       (visible en la URL del dashboard)
//   2) node scripts/set-otp-expiry.mjs              → aplica 604800s (7 días)
//   3) node scripts/set-otp-expiry.mjs 432000       → aplica 5 días (u otro)
//   4) node scripts/set-otp-expiry.mjs --read       → solo lee el valor actual
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

const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = env.SUPABASE_PROJECT_REF

if (!ACCESS_TOKEN) {
  console.error(
    'Falta SUPABASE_ACCESS_TOKEN en .env.local.\n' +
      '   Genera uno en: https://supabase.com/dashboard/account/tokens'
  )
  process.exit(1)
}
if (!PROJECT_REF) {
  console.error(
    'Falta SUPABASE_PROJECT_REF en .env.local.\n' +
      '   Lo tienes en la URL del dashboard:\n' +
      '     https://supabase.com/dashboard/project/<ESTO_DE_AQUI>'
  )
  process.exit(1)
}

// ---- Args ---------------------------------------------------------------
const DEFAULT_SECONDS = 604800 // 7 días
const args = process.argv.slice(2)
const readOnly = args.includes('--read')
const desiredSeconds = (() => {
  if (readOnly) return null
  const arg = args.find((a) => /^\d+$/.test(a))
  return arg ? parseInt(arg, 10) : DEFAULT_SECONDS
})()

// ---- API helper ---------------------------------------------------------
const API_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`

async function call(method, body) {
  const res = await fetch(API_BASE, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { ok: res.ok, status: res.status, data }
}

function formatSeconds(s) {
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (parts.length === 0) parts.push(`${s}s`)
  return `${s}s (${parts.join(' ')})`
}

// ---- Main ---------------------------------------------------------------
async function main() {
  console.log(`→ Proyecto: ${PROJECT_REF}`)

  if (readOnly) {
    console.log('→ Leyendo configuración actual...')
    const r = await call('GET')
    if (!r.ok) {
      console.error(`✗ Error ${r.status}:`, r.data)
      process.exit(1)
    }
    const current = r.data?.mailer_otp_exp
    console.log(`✓ mailer_otp_exp actual: ${formatSeconds(current)}`)
    return
  }

  console.log(`→ Aplicando mailer_otp_exp = ${formatSeconds(desiredSeconds)}`)
  const r = await call('PATCH', { mailer_otp_exp: desiredSeconds })
  if (!r.ok) {
    console.error(`✗ Error ${r.status}:`, r.data)
    process.exit(1)
  }
  const applied = r.data?.mailer_otp_exp
  if (applied !== desiredSeconds) {
    console.warn(
      `⚠ Supabase devolvió mailer_otp_exp = ${applied}, no ${desiredSeconds}. Revisa.`
    )
  } else {
    console.log(`✓ Aplicado. mailer_otp_exp = ${formatSeconds(applied)}`)
  }

  console.log('\n────────────────────────────────────')
  console.log('Listo. Los nuevos magic links durarán', formatSeconds(applied))
  console.log(
    'Para verificar: node scripts/set-otp-expiry.mjs --read'
  )
  console.log('────────────────────────────────────')
}

main().catch((e) => {
  console.error('✗ Error:', e.message || e)
  process.exit(1)
})
