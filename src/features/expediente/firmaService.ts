import { supabase } from '../../lib/supabase'

export type TipoFirma =
  | 'datos_imagen'
  | 'vacunacion'
  | 'medicacion'
  | 'reglamento_tutor'

type Args = {
  expedienteId: string
  tipo: TipoFirma
  blob: Blob
  firmadoPor: string
  textoAutorizacion: string
}

export async function subirYRegistrarFirma({
  expedienteId,
  tipo,
  blob,
  firmadoPor,
  textoAutorizacion,
}: Args): Promise<string> {
  const path = `${expedienteId}/${tipo}.png`

  const { error: upErr } = await supabase.storage
    .from('firmas')
    .upload(path, blob, { upsert: true, contentType: 'image/png' })
  if (upErr) throw upErr

  const { error: dbErr } = await supabase.from('firmas').upsert(
    {
      expediente_id: expedienteId,
      tipo,
      storage_path: path,
      firmado_por: firmadoPor,
      texto_autorizacion: textoAutorizacion,
      firmado_at: new Date().toISOString(),
    },
    { onConflict: 'expediente_id,tipo' }
  )
  if (dbErr) throw dbErr

  return path
}

export function formatearTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function textoAutorizacion(
  tipo: TipoFirma,
  ctx: { tutorNombre: string; alumnoNombre: string; timestamp: string }
): string {
  const { tutorNombre, alumnoNombre, timestamp } = ctx
  const fecha = formatearTimestamp(timestamp)
  switch (tipo) {
    case 'datos_imagen':
      return `Yo, ${tutorNombre}, como padre/madre/tutor/a de ${alumnoNombre}, doy mi conformidad al tratamiento de datos personales según se indica en este formulario y a las preferencias de uso de imagen y comunicaciones seleccionadas.\n\nFecha y hora: ${fecha}`
    case 'vacunacion':
      return `Yo, ${tutorNombre}, como padre/madre/tutor/a de ${alumnoNombre}, certifico que el/la participante está protegido/a con las vacunas que establece la normativa vigente.\n\nFecha y hora: ${fecha}`
    case 'medicacion':
      return `Yo, ${tutorNombre}, como padre/madre/tutor/a de ${alumnoNombre}, autorizo al equipo del Campus FRP, monitores y dirección, a suministrar la medicación indicada en este formulario según las dosis descritas y las aclaraciones aportadas.\n\nFecha y hora: ${fecha}`
    case 'reglamento_tutor':
      return `Yo, ${tutorNombre}, como padre/madre/tutor/a de ${alumnoNombre}, confirmo que he leído y acepto el decálogo de convivencia y el reglamento interno del Campus FRP.\n\nFecha y hora: ${fecha}`
  }
}
