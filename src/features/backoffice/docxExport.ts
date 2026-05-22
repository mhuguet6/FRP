import { supabase } from '../../lib/supabase'
import type { CampusEdicion, Expediente } from '../expediente/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

function get(e: Expediente, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') return (acc as R)[k]
    return undefined
  }, e.respuestas as R | undefined)
}

function nombreCompleto(e: Expediente): string {
  return `${e.alumno_nombre ?? (get(e, 'seccion1.nombre') as string) ?? ''} ${
    e.alumno_apellidos ?? (get(e, 'seccion1.apellidos') as string) ?? ''
  }`.trim() || '—'
}

function calcularEdad(
  fechaNac: string | null | undefined,
  fechaInicio: string | null | undefined
): string {
  if (!fechaNac || !fechaInicio) return ''
  const nac = new Date(fechaNac)
  const ini = new Date(fechaInicio)
  if (Number.isNaN(nac.getTime()) || Number.isNaN(ini.getTime())) return ''
  let edad = ini.getFullYear() - nac.getFullYear()
  const m = ini.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && ini.getDate() < nac.getDate())) edad--
  return String(edad)
}

function bool(b: boolean | null | undefined, jsonFallback?: string): boolean {
  if (b === true) return true
  if (b === false) return false
  if (jsonFallback === 'si') return true
  return false
}

function alergiasResumen(e: Expediente): string {
  const respCol = e.tiene_alergias
  const respJson = get(e, 'seccion3.alergias.respuesta') as string | undefined
  const hay = respCol === true || respJson === 'si'
  if (!hay) return ''
  const que =
    e.detalle_alergias ?? (get(e, 'seccion3.alergias.que') as string) ?? ''
  return que
}

function alergiasReaccion(e: Expediente): string {
  return (get(e, 'seccion3.alergias.reaccion') as string) ?? ''
}

function dietaResumen(e: Expediente): string {
  const dieta = get(e, 'seccion3.alimentacion.dieta') as R | undefined
  if (!dieta?.respuesta) return ''
  if (dieta.respuesta === 'no') return ''
  return (dieta.detalle as string) ?? 'Sí (sin detalle)'
}

function comeLabel(v: string | undefined): string {
  switch (v) {
    case 'poco':
      return 'Poco'
    case 'normal':
      return 'Normal'
    case 'mucho':
      return 'Mucho'
    case 'varia':
      return 'Varía'
    default:
      return ''
  }
}

function contactoPrincipal(e: Expediente): string {
  const c = get(e, 'seccion2.contactos.0') as R | undefined
  if (!c) return ''
  const partes = [c.telefono, c.nombre, c.relacion].filter(
    (p) => p && String(p).trim()
  )
  return partes.join(' / ')
}

function nivelNatacionLabel(v: string | undefined): string {
  switch (v) {
    case 'no_sabe':
      return 'No sabe nadar'
    case 'basico':
      return 'Básico'
    case 'medio':
      return 'Medio'
    case 'avanzado':
      return 'Avanzado'
    case 'otro':
      return 'Otro'
    default:
      return ''
  }
}

function medicacionResumen(e: Expediente): string {
  const tieneCol = e.tiene_medicacion
  const tieneJson = get(e, 'seccion4.durante_campus.respuesta') as string | undefined
  const hay = tieneCol === true || tieneJson === 'si'
  if (!hay) return ''
  const meds = (get(e, 'seccion4.durante_campus.medicamentos') as
    | Array<R>
    | undefined) ?? []
  if (meds.length === 0) return 'Sí (sin detalles)'
  return meds
    .map((m) => {
      const parts = [m.nombre, m.dosis, m.frecuencia].filter(
        (p) => p && String(p).trim()
      )
      return parts.join(' / ')
    })
    .join('; ')
}

function notasStaff(e: Expediente): string {
  const partes: string[] = []
  const aten = get(e, 'seccion3.atencion_especial') as R | undefined
  if (aten?.respuesta === 'si' && aten.detalle)
    partes.push(`Atención: ${aten.detalle}`)
  const miedos = get(e, 'seccion3.miedos') as R | undefined
  if (miedos?.respuesta === 'si' && miedos.detalle)
    partes.push(`Miedos: ${miedos.detalle}`)
  const car = get(e, 'seccion3.caracter') as R | undefined
  if (car?.respuesta === 'si' && car.detalle)
    partes.push(`Carácter: ${car.detalle}`)
  const dis = get(e, 'seccion3.discapacidad') as R | undefined
  if (dis?.respuesta === 'si' && dis.detalle)
    partes.push(`Discapacidad: ${dis.detalle}`)
  const obs = get(e, 'seccion6.observaciones_generales') as R | undefined
  if (obs?.respuesta === 'si' && obs.detalle)
    partes.push(`Observaciones: ${obs.detalle}`)
  return partes.join('. ')
}

// ----------------------------------------------------------------------------

async function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

type TipoImagen = 'jpg' | 'png' | 'gif' | 'bmp'

function tipoDesdeRuta(path: string): TipoImagen {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'png'
  if (ext === 'gif') return 'gif'
  if (ext === 'bmp') return 'bmp'
  return 'jpg'
}

async function descargarImagen(
  path: string
): Promise<{ data: ArrayBuffer; tipo: TipoImagen } | null> {
  try {
    const { data, error } = await supabase.storage
      .from('documentos')
      .download(path)
    if (error || !data) return null
    return { data: await data.arrayBuffer(), tipo: tipoDesdeRuta(path) }
  } catch {
    return null
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ----------------------------------------------------------------------------
// Documento 1: Cocinero — alergias y dietas
// ----------------------------------------------------------------------------

export async function exportarDocxCocinero(
  expedientes: Expediente[],
  edicion: CampusEdicion | null
): Promise<void> {
  const docx = await import('docx')
  const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    WidthType,
    AlignmentType,
    BorderStyle,
  } = docx

  const conAlergiasODieta = expedientes.filter((e) => {
    const hayAlergias = bool(
      e.tiene_alergias,
      get(e, 'seccion3.alergias.respuesta') as string
    )
    const hayDieta = !!dietaResumen(e)
    return hayAlergias || hayDieta
  })
  const sinNada = expedientes.filter((e) => !conAlergiasODieta.includes(e))

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      celdaCabecera('Alumno'),
      celdaCabecera('Edad'),
      celdaCabecera('Alergias'),
      celdaCabecera('Reacción'),
      celdaCabecera('Dieta especial'),
      celdaCabecera('Come'),
    ],
  })

  const filas = conAlergiasODieta.map(
    (e) =>
      new TableRow({
        children: [
          celda(nombreCompleto(e), true),
          celda(calcularEdad(e.fecha_nacimiento, edicion?.fecha_inicio)),
          celda(alergiasResumen(e) || '—'),
          celda(alergiasReaccion(e)),
          celda(dietaResumen(e)),
          celda(
            comeLabel(get(e, 'seccion3.alimentacion.come') as string | undefined)
          ),
        ],
      })
  )

  const tabla = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...filas],
  })

  const doc = new Document({
    creator: 'Campus FRP',
    title: 'Hoja del cocinero — Alergias y dietas',
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: edicion?.nombre ?? 'Campus FRP',
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            text: 'Hoja del cocinero — Alergias y dietas',
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Generado el ${new Date().toLocaleDateString('es-ES')}. ${conAlergiasODieta.length} de ${expedientes.length} participantes requieren atención especial.`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          tabla,
          new Paragraph({ text: '', spacing: { after: 300 } }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            text: 'Resto de participantes',
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: `Sin alergias ni dieta especial. Comen normal salvo indicación contraria.`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          ...sinNada.map(
            (e) =>
              new Paragraph({
                children: [
                  new TextRun({ text: `• ${nombreCompleto(e)}`, size: 20 }),
                  new TextRun({
                    text: ` (come: ${comeLabel(get(e, 'seccion3.alimentacion.come') as string | undefined) || '—'})`,
                    size: 18,
                    color: '64748B',
                  }),
                ],
              })
          ),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const fecha = new Date().toISOString().slice(0, 10)
  const slug = slugify(edicion?.nombre ?? 'expedientes')
  await descargar(blob, `${slug}-cocinero-${fecha}.docx`)

  // Helpers locales (necesitan TextRun, Paragraph, etc. en alcance)
  function celdaCabecera(texto: string) {
    return new TableCell({
      shading: { fill: '0F172A' },
      borders: bordeFino(),
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({ text: texto, bold: true, color: 'FFFFFF', size: 18 }),
          ],
        }),
      ],
    })
  }

  function celda(texto: string, negrita = false) {
    return new TableCell({
      borders: bordeFino(),
      children: [
        new Paragraph({
          children: [new TextRun({ text: texto || '—', size: 18, bold: negrita })],
        }),
      ],
    })
  }

  function bordeFino() {
    const b = { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
    return { top: b, bottom: b, left: b, right: b }
  }
}

// ----------------------------------------------------------------------------
// Documento 2: Staff — resumen de todos los participantes
// ----------------------------------------------------------------------------

export async function exportarDocxStaff(
  expedientes: Expediente[],
  edicion: CampusEdicion | null
): Promise<void> {
  const docx = await import('docx')
  const {
    Document,
    ImageRun,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    WidthType,
    AlignmentType,
    BorderStyle,
    PageOrientation,
  } = docx

  // Pre-cargamos todas las fotos en paralelo. null si no hay o falla.
  const fotos = await Promise.all(
    expedientes.map((e) =>
      e.foto_path ? descargarImagen(e.foto_path) : Promise.resolve(null)
    )
  )

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      celdaCabecera('Foto'),
      celdaCabecera('Alumno'),
      celdaCabecera('Edad'),
      celdaCabecera('Programa'),
      celdaCabecera('Contacto emergencia'),
      celdaCabecera('Alergias'),
      celdaCabecera('Medicación'),
      celdaCabecera('Nat.'),
      celdaCabecera('Notas'),
    ],
  })

  const filas = expedientes.map((e, idx) => {
    const foto = fotos[idx]
    return new TableRow({
      children: [
        celdaFoto(foto),
        celda(nombreCompleto(e), true),
        celda(calcularEdad(e.fecha_nacimiento, edicion?.fecha_inicio)),
        celda(
          e.programa === 'robotica'
            ? 'Robótica'
            : e.programa === 'emprendimiento'
              ? 'Emprend.'
              : ''
        ),
        celda(contactoPrincipal(e)),
        celda(alergiasResumen(e) || '—'),
        celda(medicacionResumen(e) || '—'),
        celda(
          nivelNatacionLabel(
            get(e, 'seccion6.nivel_natacion.nivel') as string | undefined
          )
        ),
        celda(notasStaff(e)),
      ],
    })
  })

  const tabla = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...filas],
  })

  const doc = new Document({
    creator: 'Campus FRP',
    title: 'Resumen de participantes — Staff',
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: edicion?.nombre ?? 'Campus FRP',
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            text: 'Resumen de participantes — Equipo / monitores',
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Generado el ${new Date().toLocaleDateString('es-ES')}. ${expedientes.length} participantes en total.`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          tabla,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const fecha = new Date().toISOString().slice(0, 10)
  const slug = slugify(edicion?.nombre ?? 'expedientes')
  await descargar(blob, `${slug}-staff-${fecha}.docx`)

  // Helpers locales
  function celdaCabecera(texto: string) {
    return new TableCell({
      shading: { fill: '0F172A' },
      borders: bordeFino(),
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({ text: texto, bold: true, color: 'FFFFFF', size: 16 }),
          ],
        }),
      ],
    })
  }

  function celda(texto: string, negrita = false) {
    return new TableCell({
      borders: bordeFino(),
      children: [
        new Paragraph({
          children: [new TextRun({ text: texto || '—', size: 16, bold: negrita })],
        }),
      ],
    })
  }

  function celdaFoto(
    foto: { data: ArrayBuffer; tipo: TipoImagen } | null
  ): InstanceType<typeof TableCell> {
    if (!foto) {
      return new TableCell({
        borders: bordeFino(),
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '—', size: 14, color: '94A3B8' }),
            ],
          }),
        ],
      })
    }
    return new TableCell({
      borders: bordeFino(),
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: foto.data,
              type: foto.tipo,
              transformation: { width: 56, height: 56 },
            }),
          ],
        }),
      ],
    })
  }

  function bordeFino() {
    const b = { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
    return { top: b, bottom: b, left: b, right: b }
  }
}


// ----------------------------------------------------------------------------
// Documento 3: Hoja sanitaria — médica (bloque por niño)
// ----------------------------------------------------------------------------

function tieneAlgoMedico(e: Expediente): boolean {
  const checks: Array<unknown> = [
    e.tiene_alergias === true,
    e.tiene_medicacion === true,
    (get(e, 'seccion3.alergias.respuesta') as string) === 'si',
    (get(e, 'seccion4.durante_campus.respuesta') as string) === 'si',
    (get(e, 'seccion4.habitual.respuesta') as string) === 'si',
    (get(e, 'seccion3.antecedentes_medicos.respuesta') as string) === 'si',
    (get(e, 'seccion3.patologias.respuesta') as string) === 'si',
    (get(e, 'seccion3.mareos.respuesta') as string) === 'si',
    (get(e, 'seccion3.covid.info.respuesta') as string) === 'si',
    (get(e, 'seccion3.discapacidad.respuesta') as string) === 'si',
    (get(e, 'seccion3.movilidad.respuesta') as string) === 'si',
    (get(e, 'seccion3.motricidad.respuesta') as string) === 'si',
    (get(e, 'seccion3.gafas_lentillas.respuesta') as string) === 'si',
    (get(e, 'seccion3.aparatos_bucales.respuesta') as string) === 'si',
    (get(e, 'seccion5.familia.salud_fisica.respuesta') as string) === 'si',
    (get(e, 'seccion5.familia.salud_emocional.respuesta') as string) === 'si',
    (get(e, 'seccion5.familia.condicion_salud.respuesta') as string) === 'si',
  ]
  return checks.some(Boolean)
}

function fmtNoSiDetalle(v: R | undefined): string {
  if (!v?.respuesta) return ''
  if (v.respuesta === 'no') return ''
  const det = (v.detalle as string | undefined) ?? ''
  return det || 'Sí (sin detalle)'
}

function medicacionHabitualResumen(e: Expediente): string {
  const tiene = (get(e, 'seccion4.habitual.respuesta') as string) === 'si'
  if (!tiene) return ''
  const meds = (get(e, 'seccion4.habitual.medicamentos') as Array<R> | undefined) ?? []
  if (meds.length === 0) return 'Sí (sin detalles)'
  return meds
    .map((m) => {
      const parts = [m.nombre, m.dosis, m.frecuencia].filter(
        (p) => p && String(p).trim()
      )
      return parts.join(' / ')
    })
    .join('; ')
}

function medicacionCampusDetalle(e: Expediente): {
  resumen: string
  recetaAdjunta: string
} {
  const tiene = (get(e, 'seccion4.durante_campus.respuesta') as string) === 'si'
  if (!tiene) return { resumen: '', recetaAdjunta: '' }
  const meds =
    (get(e, 'seccion4.durante_campus.medicamentos') as Array<R> | undefined) ?? []
  const resumen = meds.length === 0
    ? 'Sí (sin detalles)'
    : meds
        .map((m) => {
          const parts = [m.nombre, m.dosis, m.frecuencia].filter(
            (p) => p && String(p).trim()
          )
          const indic = m.indicaciones ? ` [${m.indicaciones}]` : ''
          return parts.join(' / ') + indic
        })
        .join('; ')
  const receta = get(e, 'seccion4.durante_campus.receta_adjunta') as string | undefined
  const recetaPath = get(e, 'seccion4.durante_campus.receta_path') as string | undefined
  const recetaAdjunta =
    receta === 'si'
      ? recetaPath
        ? 'Sí (subida)'
        : 'Sí (declara que adjunta)'
      : receta === 'no'
        ? 'No'
        : ''
  return { resumen, recetaAdjunta }
}

function antecedentesResumen(e: Expediente): string {
  const v = get(e, 'seccion3.antecedentes_medicos') as R | undefined
  if (v?.respuesta !== 'si') return ''
  const tipos = ((v.tipos as string[] | undefined) ?? []).join(', ')
  const otras = (v.otras as string | undefined) ?? ''
  const comentarios = (v.comentarios as string | undefined) ?? ''
  return [tipos, otras, comentarios].filter((p) => p && p.trim()).join('. ')
}

function patologiasResumen(e: Expediente): string {
  const v = get(e, 'seccion3.patologias') as R | undefined
  if (v?.respuesta !== 'si') return ''
  const tipos = ((v.tipos as string[] | undefined) ?? []).join(', ')
  const otros = (v.otros as string | undefined) ?? ''
  return [tipos, otros].filter((p) => p && p.trim()).join('. ')
}

function covidResumen(e: Expediente): string {
  const info = get(e, 'seccion3.covid.info') as R | undefined
  const dosis = get(e, 'seccion3.covid.dosis') as string | undefined
  let infoStr = ''
  if (info?.respuesta === 'si')
    infoStr = info.detalle ? `${info.detalle}` : 'Sí (sin detalle)'
  if (dosis) infoStr = infoStr ? `${infoStr}. Dosis: ${dosis}` : `Dosis: ${dosis}`
  return infoStr
}

function vacunacionResumen(e: Expediente): string {
  const opcion = get(e, 'seccion3.vacunacion.opcion') as string | undefined
  if (opcion === '1') return 'Declaración firmada por tutor/a'
  if (opcion === '2') return 'Certificado médico adjunto'
  return ''
}

export async function exportarDocxSanitario(
  expedientes: Expediente[],
  edicion: CampusEdicion | null
): Promise<void> {
  const docx = await import('docx')
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
  } = docx

  const relevantes = expedientes.filter(tieneAlgoMedico)
  const sinNada = expedientes.filter((e) => !relevantes.includes(e))

  const bloqueNino = (e: Expediente): InstanceType<typeof Paragraph>[] => {
    const edad = calcularEdad(e.fecha_nacimiento, edicion?.fecha_inicio)
    const peso = get(e, 'seccion3.alimentacion.peso_kg') as string | undefined

    const rows: Array<[string, string]> = [
      ['Alergias', alergiasResumen(e)],
      ['Reacción alergias', alergiasReaccion(e)],
      ['Peso (kg)', peso || ''],
      ['Mareos', fmtNoSiDetalle(get(e, 'seccion3.mareos') as R | undefined)],
      ['Medicación habitual', medicacionHabitualResumen(e)],
      ['Medicación durante Campus', medicacionCampusDetalle(e).resumen],
      ['Receta médica (Campus)', medicacionCampusDetalle(e).recetaAdjunta],
      ['Vacunación', vacunacionResumen(e)],
      ['Antecedentes médicos', antecedentesResumen(e)],
      ['Patologías frecuentes', patologiasResumen(e)],
      ['COVID-19', covidResumen(e)],
      ['Discapacidad', fmtNoSiDetalle(get(e, 'seccion3.discapacidad') as R | undefined)],
      ['Movilidad', fmtNoSiDetalle(get(e, 'seccion3.movilidad') as R | undefined)],
      ['Motricidad', fmtNoSiDetalle(get(e, 'seccion3.motricidad') as R | undefined)],
      ['Gafas / lentillas', fmtNoSiDetalle(get(e, 'seccion3.gafas_lentillas') as R | undefined)],
      ['Aparatos bucales', fmtNoSiDetalle(get(e, 'seccion3.aparatos_bucales') as R | undefined)],
      ['Salud física (familia)', fmtNoSiDetalle(get(e, 'seccion5.familia.salud_fisica') as R | undefined)],
      ['Salud emocional (familia)', fmtNoSiDetalle(get(e, 'seccion5.familia.salud_emocional') as R | undefined)],
      ['Condición de salud (familia)', fmtNoSiDetalle(get(e, 'seccion5.familia.condicion_salud') as R | undefined)],
    ]

    const filasNoVacias = rows.filter(([, v]) => v && v.trim().length > 0)

    const parrafos: InstanceType<typeof Paragraph>[] = []
    parrafos.push(
      new Paragraph({
        spacing: { before: 300, after: 80 },
        heading: HeadingLevel.HEADING_3,
        children: [
          new TextRun({ text: nombreCompleto(e), bold: true }),
          new TextRun({
            text: edad ? `  (${edad} años)` : '',
            size: 20,
            color: '64748B',
          }),
        ],
      })
    )

    const contacto = contactoPrincipal(e)
    if (contacto) {
      parrafos.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: `Contacto: ${contacto}`,
              size: 18,
              color: '64748B',
            }),
          ],
        })
      )
    }

    if (filasNoVacias.length === 0) {
      parrafos.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Sin observaciones específicas.',
              italics: true,
              size: 18,
            }),
          ],
        })
      )
    } else {
      filasNoVacias.forEach(([k, v]) => {
        parrafos.push(
          new Paragraph({
            spacing: { after: 60 },
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({ text: `${k}: `, bold: true, size: 20 }),
              new TextRun({ text: v, size: 20 }),
            ],
          })
        )
      })
    }

    return parrafos
  }

  const cabecera: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: edicion?.nombre ?? 'Campus FRP',
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      text: 'Hoja sanitaria — Atención médica',
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Generado el ${new Date().toLocaleDateString('es-ES')}. ${relevantes.length} de ${expedientes.length} participantes tienen información médica relevante.`,
          italics: true,
          size: 18,
        }),
      ],
    }),
  ]

  const cuerpo = relevantes.flatMap((e) => bloqueNino(e))

  const cierre: InstanceType<typeof Paragraph>[] = []
  if (sinNada.length > 0) {
    cierre.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400 },
        text: 'Sin información médica que reportar',
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: 'Estos participantes no han declarado alergias, medicación, antecedentes ni otras condiciones médicas:',
            italics: true,
            size: 18,
          }),
        ],
      }),
      ...sinNada.map(
        (e) =>
          new Paragraph({
            children: [new TextRun({ text: `• ${nombreCompleto(e)}`, size: 20 })],
          })
      )
    )
  }

  const doc = new Document({
    creator: 'Campus FRP',
    title: 'Hoja sanitaria',
    sections: [
      {
        properties: {},
        children: [...cabecera, ...cuerpo, ...cierre],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const fecha = new Date().toISOString().slice(0, 10)
  const slug = slugify(edicion?.nombre ?? 'expedientes')
  await descargar(blob, `${slug}-sanitario-${fecha}.docx`)
}
