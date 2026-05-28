import type { Expediente } from './api'

export type CampoFaltante = {
  seccion: number
  descripcion: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

function get(obj: R | undefined, path: string): unknown {
  if (!obj) return undefined
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') return (acc as R)[k]
    return undefined
  }, obj)
}

export function validarParaEnvio(expediente: Expediente): CampoFaltante[] {
  const faltantes: CampoFaltante[] = []
  const r = expediente.respuestas as R | undefined

  // Sección 1
  if (!expediente.alumno_nombre)
    faltantes.push({ seccion: 1, descripcion: 'Nombre del/de la participante' })
  if (!expediente.alumno_apellidos)
    faltantes.push({ seccion: 1, descripcion: 'Apellidos del/de la participante' })
  if (!expediente.fecha_nacimiento)
    faltantes.push({ seccion: 1, descripcion: 'Fecha de nacimiento' })
  if (!get(r, 'seccion1.direccion'))
    faltantes.push({ seccion: 1, descripcion: 'Dirección' })
  if (!expediente.foto_path)
    faltantes.push({
      seccion: 1,
      descripcion: 'Foto del/de la participante',
    })

  // Sección 2
  if (!expediente.tutor_nombre)
    faltantes.push({ seccion: 2, descripcion: 'Nombre del tutor/a' })
  if (!expediente.tutor_dni)
    faltantes.push({ seccion: 2, descripcion: 'DNI del tutor/a' })
  if (!expediente.tutor_email)
    faltantes.push({ seccion: 2, descripcion: 'Email de contacto familiar' })
  const c1 = get(r, 'seccion2.contactos.0') as
    | { telefono?: string; nombre?: string; relacion?: string }
    | undefined
  if (!c1?.telefono || !c1?.nombre || !c1?.relacion)
    faltantes.push({
      seccion: 2,
      descripcion: 'Primer teléfono de contacto (con nombre y relación)',
    })

  // Sección 3
  const alergiasResp = get(r, 'seccion3.alergias.respuesta')
  if (!alergiasResp)
    faltantes.push({ seccion: 3, descripcion: 'Indicar si hay alergias' })
  if (alergiasResp === 'si' && !get(r, 'seccion3.alergias.que'))
    faltantes.push({ seccion: 3, descripcion: '¿A qué es la alergia?' })

  if (!get(r, 'seccion3.alimentacion.come'))
    faltantes.push({ seccion: 3, descripcion: 'Cómo come (poco/normal/mucho/varía)' })
  if (!get(r, 'seccion3.experiencia_colonias.veces'))
    faltantes.push({ seccion: 3, descripcion: 'Experiencia previa en colonias' })

  const opcionVac = get(r, 'seccion3.vacunacion.opcion')
  if (!opcionVac)
    faltantes.push({ seccion: 3, descripcion: 'Opción de vacunación' })
  if (opcionVac === '2' && !get(r, 'seccion3.vacunacion.certificado_path'))
    faltantes.push({
      seccion: 3,
      descripcion: 'Certificado médico de vacunación (subir archivo)',
    })

  // Sección 4
  const campusResp = get(r, 'seccion4.durante_campus.respuesta')
  if (!campusResp)
    faltantes.push({
      seccion: 4,
      descripcion: '¿Toma medicación durante el Campus?',
    })
  if (campusResp === 'si') {
    const meds = (get(r, 'seccion4.durante_campus.medicamentos') as
      | Array<{
          nombre?: string
          dosis?: string
          horarios?: string[]
          prn?: boolean
        }>
      | undefined) ?? []
    if (meds.length === 0)
      faltantes.push({
        seccion: 4,
        descripcion: 'Al menos un medicamento durante el Campus',
      })
    meds.forEach((m, i) => {
      const faltaBasico = !m.nombre || !m.dosis
      const faltaHorario = (m.horarios ?? []).length === 0 && !m.prn
      if (faltaBasico)
        faltantes.push({
          seccion: 4,
          descripcion: `Medicamento ${i + 1}: completar nombre y dosis`,
        })
      if (faltaHorario)
        faltantes.push({
          seccion: 4,
          descripcion: `Medicamento ${i + 1}: marcar al menos una hora o "según necesidad"`,
        })
    })
  }

  // Sección 6 — decálogo + reglamento + firma tutor (firma se valida en S6)
  if (!get(r, 'seccion6.decalogo_leido'))
    faltantes.push({ seccion: 6, descripcion: 'Confirmar lectura del decálogo' })
  if (!get(r, 'seccion6.reglamento_leido'))
    faltantes.push({ seccion: 6, descripcion: 'Confirmar lectura del reglamento' })
  if (!get(r, 'seccion6.reglamento_acepto_normas'))
    faltantes.push({
      seccion: 6,
      descripcion: 'Aceptar el cumplimiento de las normas',
    })
  if (!get(r, 'seccion6.reglamento_entiendo_consecuencias'))
    faltantes.push({
      seccion: 6,
      descripcion: 'Aceptar las consecuencias del incumplimiento',
    })

  // Sección 7 — nombres del participante y del familiar/tutor que firma.
  // La firma manuscrita se valida en el propio paso de envío.
  if (!get(r, 'seccion7.participante_nombre'))
    faltantes.push({
      seccion: 7,
      descripcion: 'Nombre y apellidos del/de la participante',
    })
  if (!get(r, 'seccion7.tutor_nombre'))
    faltantes.push({
      seccion: 7,
      descripcion: 'Nombre y apellidos del familiar/tutor',
    })

  return faltantes
}

// ¿Hay que contactar con la familia para confirmar derechos de imagen?
// Aplica si han marcado la casilla de exclusión Y aún no se ha registrado
// confirmación por staff.
export function requiereConfirmacionImagen(exp: Expediente): boolean {
  if (exp.imagen_confirmada_at) return false
  const noAutorizo = (
    (exp.respuestas as Record<string, R> | undefined)?.seccion7 as R | undefined
  )?.imagen?.no_autorizo as boolean | undefined
  return noAutorizo === true
}

export function decisionImagenLabel(exp: Expediente): string | null {
  const noAutorizo = (
    (exp.respuestas as Record<string, R> | undefined)?.seccion7 as R | undefined
  )?.imagen?.no_autorizo as boolean | undefined
  if (noAutorizo === true) return 'No autoriza imagen'
  return null
}

export function firmasRequeridas(_expediente: Expediente): Array<{
  tipo: string
  titulo: string
}> {
  // Firmas que recoge la Sección 7 (revisión final).
  // - `medicacion`: recogida en S3 (Autorizaciones médicas).
  // - `vacunacion`: eliminada (ahora es solo declaración por radio en S3).
  // - `reglamento_tutor`: recogida en S6 (Decálogo de convivencia).
  // Solo queda `datos_imagen` en S7.
  return [
    {
      tipo: 'datos_imagen',
      titulo: 'Protección de datos y derechos de imagen',
    },
  ]
}
