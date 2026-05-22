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

export type Expediente = {
  id: string
  user_id: string
  edicion_id: string | null
  estado: EstadoExpediente
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
  'id, user_id, edicion_id, estado, programa, alumno_nombre, alumno_apellidos, fecha_nacimiento, curso, tutor_nombre, tutor_email, tutor_telefono, tutor_dni, foto_path, tiene_alergias, detalle_alergias, tiene_medicacion, observaciones_internas, imagen_confirmada_at, imagen_confirmada_por, respuestas, current_section, created_at, updated_at, submitted_at'

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
  expedienteId: string,
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
