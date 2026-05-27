import { supabase } from '../../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type ProgramaTipo = 'robotica' | 'emprendimiento'

export type FilaParseada = {
  rowNumber: number // fila en el Excel (1-indexada incluyendo cabecera)
  email: string | null
  tutor_nombre: string | null
  alumno_nombre: string | null
  alumno_apellidos: string | null
  fecha_nacimiento: string | null // ISO YYYY-MM-DD
  direccion: string | null
  programa: ProgramaTipo | null
  datos_clienta: R
  errores: string[]
}

export type ResultadoEnvio = {
  email: string
  filas: number[] // rowNumber de las filas con este email
  ok: boolean
  error?: string
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function norm(s: string): string {
  return s
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Mapa de cabeceras conocidas (normalizadas) → propiedad destino
// Las que empiezan con `_clienta.` van al jsonb datos_clienta
const HEADER_MAP: Record<string, string> = {
  nombre: 'alumno_nombre',
  apellidos: 'alumno_apellidos',
  apellido: 'alumno_apellidos',
  'apellidos y nombre': 'alumno_apellidos_nombre_combinado',
  correo: 'email',
  email: 'email',
  'e-mail': 'email',
  mail: 'email',
  'fecha nac': 'fecha_nacimiento',
  'fecha nacimiento': 'fecha_nacimiento',
  'fecha de nacimiento': 'fecha_nacimiento',
  fechanac: 'fecha_nacimiento',
  direccion: 'direccion',
  'direccion completa': 'direccion',
  domicilio: 'direccion',
  // Importante: "padres" suele venir con DOS nombres ("Marc Huguet y Ana López").
  // El formulario de Sección 2 pregunta por UN único tutor que firma, así que
  // NO precargamos eso aquí (lo dejamos vacío para que la familia lo escriba).
  // El dato original se preserva en datos_clienta.padres.
  padres: '_clienta.padres',
  padre: '_clienta.padre',
  madre: '_clienta.madre',
  tutor: '_clienta.tutor',
  'padre/madre/tutor': '_clienta.padres',
  programa: 'programa',
  // Campos privados de la clienta
  genero: '_clienta.genero',
  sexo: '_clienta.genero',
  edad: '_clienta.edad',
  chozo: '_clienta.chozo',
  cabana: '_clienta.chozo',
  cabaña: '_clienta.chozo',
  habitacion: '_clienta.chozo',
  repetidor: '_clienta.repetidor',
  'repetidor/a': '_clienta.repetidor',
  'repetidor a': '_clienta.repetidor',
  'centro educativo': '_clienta.centro_educativo',
  centro: '_clienta.centro_educativo',
  colegio: '_clienta.centro_educativo',
  escuela: '_clienta.centro_educativo',
  profesiones: '_clienta.profesiones',
  profesion: '_clienta.profesiones',
  importe: '_clienta.importe',
  precio: '_clienta.importe',
  pagado: '_clienta.importe',
  observaciones: '_clienta.observaciones',
  notas: '_clienta.notas',
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseFechaSpanish(value: unknown): string | null {
  if (!value) return null
  // Si exceljs nos devuelve un objeto Date
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  if (!s) return null

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY o D/M/YYYY
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m1) {
    const dd = m1[1].padStart(2, '0')
    const mm = m1[2].padStart(2, '0')
    let yyyy = m1[3]
    if (yyyy.length === 2) yyyy = (parseInt(yyyy) > 30 ? '19' : '20') + yyyy
    const iso = `${yyyy}-${mm}-${dd}`
    if (!Number.isNaN(Date.parse(iso))) return iso
  }

  // Fallback: intentar Date.parse
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return null
}

function parsePrograma(value: unknown): ProgramaTipo | null {
  if (!value) return null
  const n = norm(String(value))
  if (n.includes('emprend')) return 'emprendimiento'
  if (n.includes('robot')) return 'robotica'
  return null
}

function setearEnDatosClienta(dc: R, clave: string, value: unknown) {
  if (value === null || value === undefined || value === '') return
  dc[clave] = value
}

// ----------------------------------------------------------------------------
// Parser
// ----------------------------------------------------------------------------

export async function parseExcelInvitaciones(
  file: File,
  programaPorDefecto: ProgramaTipo | null = null
): Promise<{
  filas: FilaParseada[]
  avisos: string[]
  cabeceras: string[]
}> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const buf = await file.arrayBuffer()
  await wb.xlsx.load(buf)

  const ws = wb.worksheets[0]
  if (!ws) {
    return {
      filas: [],
      avisos: ['El archivo no contiene hojas.'],
      cabeceras: [],
    }
  }

  // Leer cabecera (fila 1)
  const cabeceras: string[] = []
  const cabeceraMap = new Map<number, string>() // col index → propiedad
  const cabecerasDesconocidas: string[] = []

  const headerRow = ws.getRow(1)
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = String(cell.value ?? '').trim()
    cabeceras.push(raw)
    const n = norm(raw)
    const prop = HEADER_MAP[n]
    if (prop) {
      cabeceraMap.set(colNumber, prop)
    } else if (raw) {
      // Cabecera desconocida → la ignoramos por completo.
      cabecerasDesconocidas.push(raw)
    }
  })

  const avisos: string[] = []
  if (cabecerasDesconocidas.length > 0) {
    avisos.push(
      `Columnas ignoradas (no las reconocemos): ${cabecerasDesconocidas.join(', ')}`
    )
  }

  // Leer filas
  const filas: FilaParseada[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return // saltar cabecera

    const fila: FilaParseada = {
      rowNumber,
      email: null,
      tutor_nombre: null,
      alumno_nombre: null,
      alumno_apellidos: null,
      fecha_nacimiento: null,
      direccion: null,
      programa: programaPorDefecto,
      datos_clienta: {},
      errores: [],
    }

    // Detectar si la fila está totalmente vacía
    let algunCampo = false

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const prop = cabeceraMap.get(colNumber)
      if (!prop) return
      const value = cell.value
      if (value === null || value === undefined || value === '') return
      algunCampo = true

      // Algunas cells contienen objetos (texto enriquecido, hipervínculos)
      // — extraemos la representación textual
      let texto: string
      if (typeof value === 'object' && value !== null) {
        if ('text' in value) texto = String((value as R).text ?? '').trim()
        else if ('result' in value)
          texto = String((value as R).result ?? '').trim()
        else if (value instanceof Date) texto = value.toISOString().slice(0, 10)
        else texto = String(value).trim()
      } else {
        texto = String(value).trim()
      }
      if (!texto) return

      switch (prop) {
        case 'email':
          fila.email = norm(texto)
          break
        case 'alumno_nombre':
          fila.alumno_nombre = texto
          break
        case 'alumno_apellidos':
          fila.alumno_apellidos = texto
          break
        case 'fecha_nacimiento':
          fila.fecha_nacimiento = parseFechaSpanish(value)
          if (!fila.fecha_nacimiento) {
            fila.errores.push(`Fecha de nacimiento no válida: "${texto}"`)
          }
          break
        case 'direccion':
          fila.direccion = texto
          break
        case 'programa': {
          const p = parsePrograma(value)
          if (p) fila.programa = p
          break
        }
        case 'alumno_apellidos_nombre_combinado': {
          // Formato típico "Pérez García, Juan" → separar
          const idx = texto.indexOf(',')
          if (idx > 0) {
            fila.alumno_apellidos = texto.slice(0, idx).trim()
            fila.alumno_nombre = texto.slice(idx + 1).trim()
          } else {
            fila.alumno_nombre = texto
          }
          break
        }
        default:
          if (prop.startsWith('_clienta.')) {
            const clave = prop.slice('_clienta.'.length)
            setearEnDatosClienta(fila.datos_clienta, clave, value)
          }
      }
    })

    if (!algunCampo) return // fila vacía → ignorar

    // Validar
    if (!fila.email) {
      fila.errores.push('Falta el email del tutor/a')
    } else if (!EMAIL_REGEX.test(fila.email)) {
      fila.errores.push(`Email no válido: "${fila.email}"`)
    }
    if (!fila.alumno_nombre && !fila.alumno_apellidos) {
      fila.errores.push('Falta el nombre del alumno/a')
    }

    filas.push(fila)
  })

  return { filas, avisos, cabeceras }
}

// ----------------------------------------------------------------------------
// Insert + envío de magic links
// ----------------------------------------------------------------------------

export async function crearInvitacionesYEnviar(
  filas: FilaParseada[],
  edicionId: string | null,
  emailRedirectTo: string
): Promise<ResultadoEnvio[]> {
  const filasValidas = filas.filter((f) => f.errores.length === 0 && f.email)

  // 1. Insertar todas las invitaciones en BD (una por fila)
  const inserts = filasValidas.map((f) => ({
    edicion_id: edicionId,
    email: f.email,
    tutor_nombre: f.tutor_nombre,
    alumno_nombre: f.alumno_nombre,
    alumno_apellidos: f.alumno_apellidos,
    fecha_nacimiento: f.fecha_nacimiento,
    direccion: f.direccion,
    programa: f.programa,
    datos_clienta: f.datos_clienta,
  }))

  if (inserts.length > 0) {
    // upsert con ignoreDuplicates → si la fila ya existe (mismo email + nombre +
    // apellidos + edición), simplemente se omite. Evita duplicar expedientes
    // si por error se sube el Excel dos veces.
    const { error: insErr } = await supabase
      .from('invitaciones')
      .upsert(inserts, {
        onConflict: 'edicion_id,email,alumno_nombre,alumno_apellidos',
        ignoreDuplicates: true,
      })
    if (insErr) {
      return filasValidas.map((f) => ({
        email: f.email!,
        filas: [f.rowNumber],
        ok: false,
        error: `No se pudo crear la invitación: ${insErr.message}`,
      }))
    }
  }

  // 2. Agrupar por email (deduplicar para no mandar varios magic links a la misma familia)
  const porEmail = new Map<string, FilaParseada[]>()
  filasValidas.forEach((f) => {
    const key = f.email!
    const lst = porEmail.get(key) ?? []
    lst.push(f)
    porEmail.set(key, lst)
  })

  // 3. Mandar magic link a cada email único
  const resultados: ResultadoEnvio[] = []
  for (const [email, lst] of porEmail) {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo,
          shouldCreateUser: true,
        },
      })
      if (error) throw error
      // Marcar enviada_at en todas las invitaciones de este email
      await supabase
        .from('invitaciones')
        .update({ enviada_at: new Date().toISOString() })
        .eq('email', email)
        .is('enviada_at', null)
      resultados.push({
        email,
        filas: lst.map((f) => f.rowNumber),
        ok: true,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      await supabase
        .from('invitaciones')
        .update({ error_envio: msg })
        .eq('email', email)
        .is('enviada_at', null)
      resultados.push({
        email,
        filas: lst.map((f) => f.rowNumber),
        ok: false,
        error: msg,
      })
    }
  }

  return resultados
}

// ----------------------------------------------------------------------------
// Reclamar (lo llama la familia al loguearse)
// ----------------------------------------------------------------------------

export async function reclamarInvitaciones(): Promise<string[]> {
  const { data, error } = await supabase.rpc('reclamar_invitaciones')
  if (error) {
    console.error('[reclamarInvitaciones]', error)
    return []
  }
  return (data ?? []).map((row: { expediente_id: string }) => row.expediente_id)
}
