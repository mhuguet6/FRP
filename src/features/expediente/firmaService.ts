import { supabase } from '../../lib/supabase'

export type TipoFirma =
  | 'datos_imagen'
  | 'vacunacion'
  | 'medicacion'
  | 'reglamento_tutor'
  | 'reglamento_nino'

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
  ctx: { alumnoNombre: string; timestamp: string }
): string {
  const { alumnoNombre, timestamp } = ctx
  const fecha = formatearTimestamp(timestamp)
  // El nombre del tutor ya no se solicita en el formulario; el texto legal
  // identifica al firmante como "el/la tutor/a firmante", la identidad
  // queda registrada vía el email autenticado de la familia + el timestamp.
  switch (tipo) {
    case 'datos_imagen':
      return `Yo, el/la tutor/a firmante de ${alumnoNombre}, doy mi conformidad al tratamiento de datos personales según se indica en este formulario y a las preferencias de uso de imagen y comunicaciones seleccionadas.\n\nFecha y hora: ${fecha}`
    case 'vacunacion':
      return `Yo, el/la tutor/a firmante de ${alumnoNombre}, certifico que el/la participante está protegido/a con las vacunas que establece la normativa vigente.\n\nFecha y hora: ${fecha}`
    case 'medicacion':
      return `Yo, el/la tutor/a firmante de ${alumnoNombre}, autorizo al equipo del Campus FRP, monitores y dirección, a suministrar la medicación indicada en este formulario según las dosis descritas y las aclaraciones aportadas.\n\nFecha y hora: ${fecha}`
    case 'reglamento_tutor':
      return `Yo, el/la tutor/a firmante de ${alumnoNombre}, confirmo que he leído y acepto el decálogo de convivencia y el reglamento interno del Campus FRP.\n\nFecha y hora: ${fecha}`
    case 'reglamento_nino':
      return `Yo, ${alumnoNombre}, conozco el decálogo de convivencia y el reglamento del Campus FRP y me comprometo a respetarlos.\n\nFecha y hora: ${fecha}`
  }
}
