import { supabase } from '../../lib/supabase'

export type EstadoExpediente =
  | 'creado'
  | 'en_progreso'
  | 'pendiente_de_firma'
  | 'enviado'
  | 'validado'
  | 'requiere_correccion'
  | 'cerrado'

export type ProgramaTipo = 'robotica' | 'emprendimiento'
export type TipoExpediente = 'estudiante' | 'staff'

export type Expediente = {
  id: string
  user_id: string | null
  numero_participante: string | null
  edicion_id: string | null
  estado: EstadoExpediente
  tipo: TipoExpediente
  programa: ProgramaTipo | null
  alumno_nombre: string | null
  alumno_apellidos: string | null
  fecha_nacimiento: string | null
  curso: string | null
  tutor_nombre: string | null
  tutor_email: string | null
  tutor_telefono: string | null
  tutor_dni: string | null
  foto_path: string | null
  tiene_alergias: boolean | null
  detalle_alergias: string | null
  tiene_medicacion: boolean | null
  observaciones_internas: string | null
  imagen_confirmada_at: string | null
  imagen_confirmada_por: string | null
  pagado_at: string | null
  pagado_por: string | null
  formulario_enviado_at: string | null
  formulario_enviado_por: string | null
  modificado_postenvio_at: string | null
  respuestas: Record<string, unknown>
  current_section: number
  created_at: string
  updated_at: string
  submitted_at: string | null
}

export type CampusEdicion = {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  fechas_llamada_familias: string[]
  activa: boolean
}

const EXPEDIENTE_SELECT =
  'id, user_id, numero_participante, edicion_id, estado, tipo, programa, alumno_nombre, alumno_apellidos, fecha_nacimiento, curso, tutor_nombre, tutor_email, tutor_telefono, tutor_dni, foto_path, tiene_alergias, detalle_alergias, tiene_medicacion, observaciones_internas, imagen_confirmada_at, imagen_confirmada_por, pagado_at, pagado_por, formulario_enviado_at, formulario_enviado_por, modificado_postenvio_at, respuestas, current_section, created_at, updated_at, submitted_at'

export async function getEdicionActiva(): Promise<CampusEdicion | null> {
  const { data, error } = await supabase
    .from('campus_edicion')
    .select('id, nombre, fecha_inicio, fecha_fin, fechas_llamada_familias, activa')
    .eq('activa', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listarExpedientes(userId: string): Promise<Expediente[]> {
  const { data, error } = await supabase
    .from('expedientes')
    .select(EXPEDIENTE_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function listarTodosExpedientes(): Promise<Expediente[]> {
  const { data, error } = await supabase
    .from('expedientes')
    .select(EXPEDIENTE_SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getExpediente(id: string): Promise<Expediente> {
  const { data, error } = await supabase
    .from('expedientes')
    .select(EXPEDIENTE_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function crearExpediente(userId: string): Promise<Expediente> {
  const edicion = await getEdicionActiva()
  const { data, error } = await supabase
    .from('expedientes')
    .insert({
      user_id: userId,
      estado: 'creado',
      edicion_id: edicion?.id ?? null,
    })
    .select(EXPEDIENTE_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function actualizarExpediente(
  id: string,
  patch: Partial<Expediente>
): Promise<void> {
  const { error } = await supabase.from('expedientes').update(patch).eq('id', id)
  if (error) throw error
}

export async function registrarEvento(
  expedienteId: string | null,
  tipo: string,
  payload: Record<string, unknown> = {},
  actor: string = 'familia'
) {
  const { error } = await supabase.from('eventos').insert({
    expediente_id: expedienteId,
    tipo,
    payload,
    actor,
  })
  if (error) console.warn('[evento]', error.message)
}

export async function subirArchivo(
  expedienteId: string,
  file: File,
  carpeta: string
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${expedienteId}/${carpeta}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('documentos')
    .upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw error
  return path
}

export async function getUrlFirmada(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documentos')
    .createSignedUrl(path, 60 * 10)
  if (error) throw error
  return data.signedUrl
}

export async function borrarArchivo(path: string): Promise<void> {
  const { error } = await supabase.storage.from('documentos').remove([path])
  if (error) console.warn('[storage]', error.message)
}

// ----------------------------------------------------------------------------
// Pago y envío del formulario (staff)
// ----------------------------------------------------------------------------

export async function marcarPagado(
  expedienteId: string,
  pagado: boolean,
  staffEmail: string
): Promise<void> {
  const { error } = await supabase
    .from('expedientes')
    .update(
      pagado
        ? {
            pagado_at: new Date().toISOString(),
            pagado_por: staffEmail,
          }
        : { pagado_at: null, pagado_por: null }
    )
    .eq('id', expedienteId)
  if (error) throw error
}

/**
 * Revierte la confirmación de pago de un expediente. Solo para casos en
 * los que el admin marcó pagado por error. Registra un evento de auditoría.
 */
export async function anularPago(
  expedienteId: string,
  staffEmail: string
): Promise<void> {
  const { error } = await supabase
    .from('expedientes')
    .update({ pagado_at: null, pagado_por: null })
    .eq('id', expedienteId)
  if (error) throw error
  await registrarEvento(
    expedienteId,
    'pago_revertido',
    { por: staffEmail },
    staffEmail
  )
}

export type ResultadoEnvioForm = {
  expedienteId: string
  email: string
  ok: boolean
  error?: string
}

/**
 * Envía el magic link del formulario a una lista de expedientes pagados.
 * Deduplica por email (una familia con dos hijos recibe un único correo).
 * Marca `formulario_enviado_at` en cada expediente enviado correctamente.
 *
 * NOTA: la asociación "magic-link-user ↔ expediente existente" depende de
 * que la base tenga creada una invitación apuntando a este expediente, o
 * de que el RPC `reclamar_invitaciones()` se actualice para enlazar por
 * email. Mientras no exista UI de clienta, este flujo se usará sobre todo
 * para reenvíos a familias que ya tenían user_id.
 */
export async function enviarFormularioAExpedientes(
  expedientes: Expediente[],
  emailRedirectTo: string,
  staffEmail: string
): Promise<ResultadoEnvioForm[]> {
  const resultados: ResultadoEnvioForm[] = []

  // Agrupar por tutor_email para deduplicar el envío
  const porEmail = new Map<string, Expediente[]>()
  for (const e of expedientes) {
    const email = (e.tutor_email ?? '').trim().toLowerCase()
    if (!email) {
      resultados.push({
        expedienteId: e.id,
        email: '',
        ok: false,
        error: 'Sin email de tutor',
      })
      continue
    }
    const lst = porEmail.get(email) ?? []
    lst.push(e)
    porEmail.set(email, lst)
  }

  const ahora = new Date().toISOString()
  for (const [email, lst] of porEmail) {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo, shouldCreateUser: true },
      })
      if (error) throw error

      const ids = lst.map((e) => e.id)
      const { error: updErr } = await supabase
        .from('expedientes')
        .update({
          formulario_enviado_at: ahora,
          formulario_enviado_por: staffEmail,
        })
        .in('id', ids)
      if (updErr) throw updErr

      for (const e of lst) {
        resultados.push({ expedienteId: e.id, email, ok: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      for (const e of lst) {
        resultados.push({ expedienteId: e.id, email, ok: false, error: msg })
      }
    }
  }

  return resultados
}

// ----------------------------------------------------------------------------
// Flujo "clienta": crear expedientes con info básica + invitación enlazada
// ----------------------------------------------------------------------------

export type DatosNinoClienta = {
  alumno_nombre: string
  alumno_apellidos: string
  tutor_email: string
  fecha_nacimiento: string | null // ISO YYYY-MM-DD
  direccion: string
  programa: ProgramaTipo
  // Campos privados de la clienta (no llegan al formulario de la familia)
  genero?: string | null
  edad?: number | null
  chozo?: string | null
  repetidor?: string | null
  centro_educativo?: string | null
  padres?: string | null
  profesiones?: string | null
  importe?: string | null
  observaciones?: string | null
}

function datosPrivadosClienta(d: DatosNinoClienta): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (d.genero) out.genero = d.genero
  if (d.edad !== undefined && d.edad !== null) out.edad = d.edad
  if (d.chozo) out.chozo = d.chozo
  if (d.repetidor) out.repetidor = d.repetidor
  if (d.centro_educativo) out.centro_educativo = d.centro_educativo
  if (d.padres) out.padres = d.padres
  if (d.profesiones) out.profesiones = d.profesiones
  if (d.importe) out.importe = d.importe
  if (d.observaciones) out.observaciones = d.observaciones
  return out
}

// Lectura de datos_clienta (solo staff/clienta los pueden ver)
export type DatosClientaRow = {
  expediente_id: string
  datos: Record<string, unknown>
}

export async function getDatosClienta(
  expedienteId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('datos_clienta')
    .select('datos')
    .eq('expediente_id', expedienteId)
    .maybeSingle()
  if (error) {
    console.warn('[datos_clienta select]', error.message)
    return null
  }
  return (data?.datos as Record<string, unknown>) ?? null
}

/**
 * Crea un expediente con info básica + la invitación enlazada con
 * `expediente_id` apuntando a él. El magic link NO se envía aquí:
 * eso lo hace el admin desde /admin cuando marca el pago.
 *
 * Devuelve el expediente recién creado (incluye numero_participante).
 */
export async function crearExpedienteDesdeClienta(
  datos: DatosNinoClienta,
  edicionId: string | null
): Promise<Expediente> {
  const email = datos.tutor_email.trim().toLowerCase()
  const respuestasIniciales: Record<string, unknown> = {
    seccion1: {
      nombre: datos.alumno_nombre,
      apellidos: datos.alumno_apellidos,
      fecha_nacimiento: datos.fecha_nacimiento ?? '',
      direccion: datos.direccion,
    },
    seccion2: {
      email_contacto: email,
    },
  }

  const { data: exp, error: expErr } = await supabase
    .from('expedientes')
    .insert({
      user_id: null,
      edicion_id: edicionId,
      estado: 'creado',
      tipo: 'estudiante',
      programa: datos.programa,
      alumno_nombre: datos.alumno_nombre,
      alumno_apellidos: datos.alumno_apellidos,
      fecha_nacimiento: datos.fecha_nacimiento,
      tutor_email: email,
      respuestas: respuestasIniciales,
    })
    .select(EXPEDIENTE_SELECT)
    .single()
  if (expErr || !exp) throw expErr ?? new Error('No se pudo crear el expediente')

  const datosPrivados = datosPrivadosClienta(datos)
  if (Object.keys(datosPrivados).length > 0) {
    const { error: dcErr } = await supabase
      .from('datos_clienta')
      .insert({ expediente_id: exp.id, datos: datosPrivados })
    if (dcErr) {
      // No revertimos — el expediente queda creado y datos_clienta se puede
      // re-rellenar después. Solo logueamos.
      console.warn('[datos_clienta insert]', dcErr.message)
    }
  }

  // Invitación enlazada: cuando el admin marque pagado y envíe, esta
  // invitación se marca enviada_at. Cuando la familia entre por el magic
  // link, `reclamar_invitaciones()` enlazará su user_id a este expediente.
  const { error: invErr } = await supabase.from('invitaciones').insert({
    edicion_id: edicionId,
    email,
    alumno_nombre: datos.alumno_nombre,
    alumno_apellidos: datos.alumno_apellidos,
    fecha_nacimiento: datos.fecha_nacimiento,
    direccion: datos.direccion,
    programa: datos.programa,
    datos_clienta: datosPrivados,
    expediente_id: exp.id,
  })
  if (invErr) {
    console.warn('[invitaciones insert]', invErr.message)
  }

  return exp
}

/**
 * Listado de expedientes de la edición indicada. La clienta lo usa para
 * ver lo que ya ha cargado. Restringido a `tipo='estudiante'` — el staff
 * del Campus es asunto del admin y no se muestra a la clienta.
 */
export async function listarExpedientesPorEdicion(
  edicionId: string
): Promise<Expediente[]> {
  const { data, error } = await supabase
    .from('expedientes')
    .select(EXPEDIENTE_SELECT)
    .eq('edicion_id', edicionId)
    .eq('tipo', 'estudiante')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function borrarExpedienteVacio(id: string): Promise<void> {
  // RLS solo deja borrar si submitted_at is null (política de la clienta).
  const { error } = await supabase.from('expedientes').delete().eq('id', id)
  if (error) throw error
}

// ----------------------------------------------------------------------------
// Staff: alta manual de un miembro del equipo (solo admin)
// ----------------------------------------------------------------------------

export type MedicamentoStaff = {
  nombre: string
  dosis: string
  horarios: string[]
  prn: boolean
  indicaciones: string
}

export type DatosStaff = {
  // Básico
  nombre: string
  apellidos: string
  fecha_nacimiento: string | null
  dni: string
  email: string
  telefono: string
  programa: ProgramaTipo | null
  // Alergias
  tiene_alergias: boolean
  alergias_detalle: string
  alergias_reaccion: string
  // Comida
  tiene_dieta: boolean
  dieta_detalle: string
  come: '' | 'poco' | 'normal' | 'mucho' | 'varia'
  // Medicación
  toma_medicacion: boolean
  medicamentos: MedicamentoStaff[]
}

// ----------------------------------------------------------------------------
// Recordatorios a familias que recibieron el formulario y aún no lo
// han enviado.
// ----------------------------------------------------------------------------

export type PendienteRecordatorio = {
  expediente: Expediente
  ultimoRecordatorioAt: string | null
  recordatoriosCount: number
}

export async function listarPendientesRecordatorio(): Promise<
  PendienteRecordatorio[]
> {
  const { data: expedientes, error } = await supabase
    .from('expedientes')
    .select(EXPEDIENTE_SELECT)
    .eq('tipo', 'estudiante')
    .not('formulario_enviado_at', 'is', null)
    .is('submitted_at', null)
    .order('formulario_enviado_at', { ascending: true })
  if (error) throw error
  const lista = (expedientes ?? []) as Expediente[]
  const ids = lista.map((e) => e.id)
  if (ids.length === 0) return []

  const { data: eventos } = await supabase
    .from('eventos')
    .select('expediente_id, created_at')
    .eq('tipo', 'recordatorio_enviado')
    .in('expediente_id', ids)
    .order('created_at', { ascending: false })

  const lastByExp = new Map<string, string>()
  const countByExp = new Map<string, number>()
  for (const ev of (eventos ?? []) as Array<{
    expediente_id: string | null
    created_at: string
  }>) {
    if (!ev.expediente_id) continue
    if (!lastByExp.has(ev.expediente_id))
      lastByExp.set(ev.expediente_id, ev.created_at)
    countByExp.set(
      ev.expediente_id,
      (countByExp.get(ev.expediente_id) ?? 0) + 1
    )
  }

  return lista.map((e) => ({
    expediente: e,
    ultimoRecordatorioAt: lastByExp.get(e.id) ?? null,
    recordatoriosCount: countByExp.get(e.id) ?? 0,
  }))
}

/**
 * Reenvía el magic link a las familias seleccionadas y registra un evento
 * `recordatorio_enviado` por cada expediente. No toca `formulario_enviado_at`
 * (ya está fijado desde el envío original).
 */
export async function enviarRecordatorios(
  expedientes: Expediente[],
  emailRedirectTo: string,
  staffEmail: string
): Promise<ResultadoEnvioForm[]> {
  const resultados: ResultadoEnvioForm[] = []

  const porEmail = new Map<string, Expediente[]>()
  for (const e of expedientes) {
    const email = (e.tutor_email ?? '').trim().toLowerCase()
    if (!email) {
      resultados.push({
        expedienteId: e.id,
        email: '',
        ok: false,
        error: 'Sin email de tutor',
      })
      continue
    }
    const lst = porEmail.get(email) ?? []
    lst.push(e)
    porEmail.set(email, lst)
  }

  for (const [email, lst] of porEmail) {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo, shouldCreateUser: false },
      })
      if (error) throw error
      for (const e of lst) {
        await registrarEvento(
          e.id,
          'recordatorio_enviado',
          { por: staffEmail },
          staffEmail
        )
        resultados.push({ expedienteId: e.id, email, ok: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      for (const e of lst) {
        resultados.push({ expedienteId: e.id, email, ok: false, error: msg })
      }
    }
  }

  return resultados
}

// ----------------------------------------------------------------------------
// Datos para el "Log de actividad" (lecturas para el PDF de auditoría)
// ----------------------------------------------------------------------------

export type FormularioEnviadoRow = {
  id: string
  numero_participante: string | null
  alumno_nombre: string | null
  alumno_apellidos: string | null
  tutor_email: string | null
  programa: ProgramaTipo | null
  tipo: TipoExpediente
  formulario_enviado_at: string
  formulario_enviado_por: string | null
}

export type EventoPdfRow = {
  id: number
  tipo: string
  payload: Record<string, unknown>
  actor: string | null
  created_at: string
}

export async function listarFormulariosEnviados(): Promise<FormularioEnviadoRow[]> {
  const { data, error } = await supabase
    .from('expedientes')
    .select(
      'id, numero_participante, alumno_nombre, alumno_apellidos, tutor_email, programa, tipo, formulario_enviado_at, formulario_enviado_por'
    )
    .not('formulario_enviado_at', 'is', null)
    .order('formulario_enviado_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FormularioEnviadoRow[]
}

export async function listarPdfsGenerados(): Promise<EventoPdfRow[]> {
  const { data, error } = await supabase
    .from('eventos')
    .select('id, tipo, payload, actor, created_at')
    .eq('tipo', 'pdf_generado')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EventoPdfRow[]
}

export async function crearStaff(
  d: DatosStaff,
  edicionId: string | null
): Promise<Expediente> {
  const respuestas: Record<string, unknown> = {
    seccion1: {
      nombre: d.nombre,
      apellidos: d.apellidos,
      fecha_nacimiento: d.fecha_nacimiento ?? '',
    },
    seccion3: {
      alergias: d.tiene_alergias
        ? {
            respuesta: 'si',
            que: d.alergias_detalle,
            reaccion: d.alergias_reaccion,
          }
        : { respuesta: 'no' },
      alimentacion: {
        dieta: d.tiene_dieta
          ? { respuesta: 'si', detalle: d.dieta_detalle }
          : { respuesta: 'no' },
        come: d.come || undefined,
      },
    },
    seccion4: {
      durante_campus: {
        respuesta: d.toma_medicacion ? 'si' : 'no',
        medicamentos: d.toma_medicacion ? d.medicamentos : [],
      },
    },
  }

  const { data, error } = await supabase
    .from('expedientes')
    .insert({
      user_id: null,
      edicion_id: edicionId,
      estado: 'creado',
      tipo: 'staff',
      programa: d.programa,
      alumno_nombre: d.nombre,
      alumno_apellidos: d.apellidos,
      fecha_nacimiento: d.fecha_nacimiento,
      tutor_nombre: `${d.nombre} ${d.apellidos}`.trim(),
      tutor_email: d.email.trim().toLowerCase() || null,
      tutor_telefono: d.telefono.trim() || null,
      tutor_dni: d.dni.trim() || null,
      tiene_alergias: d.tiene_alergias,
      detalle_alergias: d.tiene_alergias ? d.alergias_detalle : null,
      tiene_medicacion: d.toma_medicacion,
      respuestas,
    })
    .select(EXPEDIENTE_SELECT)
    .single()
  if (error || !data) throw error ?? new Error('No se pudo crear el staff')
  return data
}
