import type {
  CampusEdicion,
  EventoPdfRow,
  Expediente,
  FormularioEnviadoRow,
} from '../expediente/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// ---------------------------------------------------------------------------
// Helpers compartidos
// ---------------------------------------------------------------------------

function get(e: Expediente, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') return (acc as R)[k]
    return undefined
  }, e.respuestas as R | undefined)
}

function nombreCompleto(e: Expediente): string {
  return (
    `${e.alumno_nombre ?? (get(e, 'seccion1.nombre') as string) ?? ''} ${
      e.alumno_apellidos ?? (get(e, 'seccion1.apellidos') as string) ?? ''
    }`.trim() || '—'
  )
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

// La estructura nueva guarda alergias en `seccion2.alergias.{alimenticias,otras}`.
// Los datos viejos quedan en `seccion3.alergias.que` o en la columna
// denormalizada `detalle_alergias`. Estos helpers manejan ambos.
function tieneAlergias(e: Expediente): boolean {
  const respCol = e.tiene_alergias
  const respS2 = get(e, 'seccion2.alergias.respuesta') as string | undefined
  const respS3 = get(e, 'seccion3.alergias.respuesta') as string | undefined
  return respCol === true || respS2 === 'si' || respS3 === 'si'
}

// Para el cocinero — solo alimenticias.
function alergiasAlimenticias(e: Expediente): string {
  if (!tieneAlergias(e)) return ''
  const nueva = (get(e, 'seccion2.alergias.alimenticias') as string) ?? ''
  if (nueva.trim()) return nueva.trim()
  // Fallback a datos legacy (texto único sin categorizar).
  return (
    ((get(e, 'seccion2.alergias.que') as string) ?? '').trim() ||
    ((get(e, 'seccion3.alergias.que') as string) ?? '').trim() ||
    ((e.detalle_alergias as string | null) ?? '').trim() ||
    ''
  )
}

// Para el médico — otras (ambientales, medicamentos, contacto).
function alergiasOtras(e: Expediente): string {
  if (!tieneAlergias(e)) return ''
  return ((get(e, 'seccion2.alergias.otras') as string) ?? '').trim()
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
  return [c.telefono, c.nombre, c.relacion]
    .filter((p) => p && String(p).trim())
    .join(' / ')
}

function medHorarioTexto(m: R): string {
  const horarios = Array.isArray(m.horarios) ? (m.horarios as string[]) : []
  const partes: string[] = []
  if (horarios.length > 0) partes.push(horarios.join(', '))
  if (m.prn === true) partes.push('según necesidad')
  if (partes.length > 0) return partes.join(' + ')
  return typeof m.frecuencia === 'string' ? m.frecuencia.trim() : ''
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Detecta qué tipo (estudiante/staff) y programas hay en la selección
// filtrada para reflejar la combinación exacta en el nombre del archivo.
function programaSlug(expedientes: Expediente[]): string {
  const set = new Set<string>()
  for (const e of expedientes) if (e.programa) set.add(e.programa)
  if (set.size === 0) return 'sin-programa'
  if (set.size === 1) return Array.from(set)[0]
  return 'todos-programas'
}

function tipoSlug(expedientes: Expediente[]): string {
  const set = new Set<string>()
  for (const e of expedientes) if (e.tipo) set.add(e.tipo)
  if (set.size === 0) return 'sin-tipo'
  if (set.size === 1) return Array.from(set)[0] + 's'
  return 'todos-tipos'
}

function nombreArchivo(
  rol: string,
  edicion: CampusEdicion | null,
  expedientes: Expediente[]
): string {
  const fecha = new Date().toISOString().slice(0, 10)
  const slugEd = slugify(edicion?.nombre ?? 'expedientes')
  const slugTipo = tipoSlug(expedientes)
  const slugProg = programaSlug(expedientes)
  return `${slugEd}-${rol}-${slugTipo}-${slugProg}-${fecha}.pdf`
}

// ---------------------------------------------------------------------------
// PDF setup compartido
// ---------------------------------------------------------------------------

type JsPDFCtor = typeof import('jspdf').jsPDF
type JsPDFDoc = InstanceType<JsPDFCtor>
type AutoTableFn = typeof import('jspdf-autotable').default

async function loadPdf(): Promise<{ jsPDF: JsPDFCtor; autoTable: AutoTableFn }> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  return { jsPDF, autoTable }
}

const COLOR_HEADER_BG: [number, number, number] = [15, 23, 42] // slate-900
const COLOR_HEADER_TXT: [number, number, number] = [255, 255, 255]
const COLOR_GREY_TXT: [number, number, number] = [100, 116, 139] // slate-500
const COLOR_BODY_TXT: [number, number, number] = [15, 23, 42]

function pintarCabecera(
  doc: JsPDFDoc,
  edicion: CampusEdicion | null,
  titulo: string,
  subtitulo: string
) {
  doc.setTextColor(...COLOR_BODY_TXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(edicion?.nombre ?? 'Campus FRP', 14, 16)
  doc.setFontSize(14)
  doc.text(titulo, 14, 24)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_GREY_TXT)
  doc.text(subtitulo, 14, 30)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLOR_BODY_TXT)
}

function descargarBlob(doc: JsPDFDoc, filename: string) {
  doc.save(filename)
}

// ===========================================================================
// 1) Cocinero
// ===========================================================================

export async function exportarPdfCocinero(
  expedientes: Expediente[],
  edicion: CampusEdicion | null
): Promise<void> {
  const { jsPDF, autoTable } = await loadPdf()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // Cocinero: solo participantes con alergia ALIMENTICIA o dieta especial.
  // Las alergias ambientales/medicamentos no son problema en la cocina.
  const conAlergiasODieta = expedientes.filter((e) => {
    const hayAlergiaComida = !!alergiasAlimenticias(e)
    const hayDieta = !!dietaResumen(e)
    return hayAlergiaComida || hayDieta
  })
  const sinNada = expedientes.filter((e) => !conAlergiasODieta.includes(e))

  pintarCabecera(
    doc,
    edicion,
    'Hoja del cocinero — Alergias y dietas',
    `Generado el ${new Date().toLocaleDateString('es-ES')}. ${conAlergiasODieta.length} de ${expedientes.length} participantes requieren atención especial.`
  )

  autoTable(doc, {
    startY: 36,
    head: [
      ['Alumno', 'Edad', 'Alergias alimenticias', 'Reacción', 'Dieta especial', 'Come'],
    ],
    body: conAlergiasODieta.map((e) => [
      nombreCompleto(e),
      calcularEdad(e.fecha_nacimiento, edicion?.fecha_inicio),
      alergiasAlimenticias(e) || '—',
      alergiasReaccion(e),
      dietaResumen(e),
      comeLabel(get(e, 'seccion3.alimentacion.come') as string | undefined),
    ]),
    headStyles: { fillColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TXT, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: COLOR_BODY_TXT },
    styles: { cellPadding: 2 },
    margin: { left: 14, right: 14 },
  })

  // Sección "Resto"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 36
  let y = finalY + 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Resto de participantes', 14, y)
  y += 4
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(...COLOR_GREY_TXT)
  doc.text('Sin alergias ni dieta especial. Comen normal salvo indicación contraria.', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLOR_BODY_TXT)
  doc.setFontSize(10)
  y += 6
  for (const e of sinNada) {
    if (y > 280) {
      doc.addPage()
      y = 20
    }
    const come = comeLabel(get(e, 'seccion3.alimentacion.come') as string | undefined)
    doc.text(`• ${nombreCompleto(e)}`, 14, y)
    doc.setTextColor(...COLOR_GREY_TXT)
    doc.setFontSize(9)
    doc.text(`  (come: ${come || '—'})`, 60, y)
    doc.setFontSize(10)
    doc.setTextColor(...COLOR_BODY_TXT)
    y += 5
  }

  descargarBlob(doc, nombreArchivo('cocinero', edicion, expedientes))
}

// ===========================================================================
// 2) Sanitario (bloque por niño)
// ===========================================================================

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
    .map((m) =>
      [m.nombre, m.dosis, medHorarioTexto(m)]
        .filter((p) => p && String(p).trim())
        .join(' / ')
    )
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
  const resumen =
    meds.length === 0
      ? 'Sí (sin detalles)'
      : meds
          .map((m) => {
            const parts = [m.nombre, m.dosis, medHorarioTexto(m)].filter(
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

export async function exportarPdfSanitario(
  expedientes: Expediente[],
  edicion: CampusEdicion | null
): Promise<void> {
  const { jsPDF } = await loadPdf()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const relevantes = expedientes.filter(tieneAlgoMedico)
  const sinNada = expedientes.filter((e) => !relevantes.includes(e))

  pintarCabecera(
    doc,
    edicion,
    'Hoja sanitaria — Atención médica',
    `Generado el ${new Date().toLocaleDateString('es-ES')}. ${relevantes.length} de ${expedientes.length} participantes tienen información médica relevante.`
  )

  let y = 38
  const margin = 14
  const pageBottom = 285

  const ensureSpace = (lines: number) => {
    if (y + lines * 5 > pageBottom) {
      doc.addPage()
      y = 20
    }
  }

  for (const e of relevantes) {
    const edad = calcularEdad(e.fecha_nacimiento, edicion?.fecha_inicio)
    const peso = get(e, 'seccion3.alimentacion.peso_kg') as string | undefined

    const rows: Array<[string, string]> = [
      ['Alergias alimenticias', alergiasAlimenticias(e)],
      ['Otras alergias', alergiasOtras(e)],
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

    ensureSpace(2 + filasNoVacias.length + 1)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`${nombreCompleto(e)}${edad ? `  (${edad} años)` : ''}`, margin, y)
    y += 5
    const contacto = contactoPrincipal(e)
    if (contacto) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...COLOR_GREY_TXT)
      doc.text(`Contacto: ${contacto}`, margin, y)
      doc.setTextColor(...COLOR_BODY_TXT)
      y += 5
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (filasNoVacias.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(...COLOR_GREY_TXT)
      doc.text('Sin observaciones específicas.', margin, y)
      doc.setTextColor(...COLOR_BODY_TXT)
      doc.setFont('helvetica', 'normal')
      y += 6
    } else {
      for (const [k, v] of filasNoVacias) {
        ensureSpace(1)
        doc.setFont('helvetica', 'bold')
        doc.text(`${k}: `, margin, y)
        const wKey = doc.getTextWidth(`${k}: `)
        doc.setFont('helvetica', 'normal')
        const splitV = doc.splitTextToSize(v, 180 - wKey)
        doc.text(splitV, margin + wKey, y)
        y += 5 * splitV.length
      }
      y += 3
    }
  }

  if (sinNada.length > 0) {
    ensureSpace(3)
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Sin información médica que reportar', margin, y)
    y += 5
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_GREY_TXT)
    doc.text(
      'Estos participantes no han declarado alergias, medicación, antecedentes ni otras condiciones médicas:',
      margin,
      y
    )
    doc.setTextColor(...COLOR_BODY_TXT)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    y += 5
    for (const e of sinNada) {
      ensureSpace(1)
      doc.text(`• ${nombreCompleto(e)}`, margin, y)
      y += 5
    }
  }

  descargarBlob(doc, nombreArchivo('sanitario', edicion, expedientes))
}

// ===========================================================================
// 4) Médico — administración de medicación
// ===========================================================================

type MedItem = {
  nombre: string
  dosis: string
  horarios: string[]
  prn: boolean
  frecuenciaLegacy: string
  indicaciones: string
}

function medicamentosCampus(e: Expediente): MedItem[] {
  const tiene =
    e.tiene_medicacion === true ||
    (get(e, 'seccion4.durante_campus.respuesta') as string) === 'si'
  if (!tiene) return []
  const meds =
    (get(e, 'seccion4.durante_campus.medicamentos') as Array<R> | undefined) ?? []
  return meds
    .map((m) => {
      const horarios = Array.isArray(m.horarios)
        ? (m.horarios as string[]).filter((h) => typeof h === 'string')
        : []
      return {
        nombre: String(m.nombre ?? '').trim(),
        dosis: String(m.dosis ?? '').trim(),
        horarios,
        prn: m.prn === true,
        frecuenciaLegacy:
          typeof m.frecuencia === 'string' ? m.frecuencia.trim() : '',
        indicaciones: String(m.indicaciones ?? '').trim(),
      }
    })
    .filter(
      (m) =>
        m.nombre ||
        m.dosis ||
        m.horarios.length > 0 ||
        m.prn ||
        m.frecuenciaLegacy
    )
}

const PALABRAS_HORA: Array<[RegExp, string]> = [
  [/\bdesayun\w*/i, '08:00'],
  [/\balmuerz\w*/i, '11:00'],
  [/\bcomida|comer\b|comemos\b/i, '14:00'],
  [/\bmerie?nd\w*/i, '17:00'],
  [/\bcena|cenar\b|cenamos\b/i, '21:00'],
  [/\bantes\s+de\s+dormir|al\s+acostars?e|por\s+la\s+noche\s+al\s+acostars?e\b/i, '22:00'],
]

function extraerHoras(frecuencia: string): string[] {
  if (!frecuencia) return []
  const horas = new Set<string>()
  const reExplicita = /\b(?:a\s+las\s+)?([01]?\d|2[0-3])(?:\s*[:.]?\s*([0-5]\d))?\s*h\b/gi
  let m: RegExpExecArray | null
  while ((m = reExplicita.exec(frecuencia)) !== null) {
    const hh = String(parseInt(m[1] ?? '', 10)).padStart(2, '0')
    const mm = m[2] ? m[2] : '00'
    horas.add(`${hh}:${mm}`)
  }
  const reALas = /\ba\s+las\s+([01]?\d|2[0-3])\b/gi
  while ((m = reALas.exec(frecuencia)) !== null) {
    const hh = String(parseInt(m[1] ?? '', 10)).padStart(2, '0')
    horas.add(`${hh}:00`)
  }
  const reHM = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g
  while ((m = reHM.exec(frecuencia)) !== null) {
    const hh = String(parseInt(m[1] ?? '', 10)).padStart(2, '0')
    horas.add(`${hh}:${m[2]}`)
  }
  for (const [re, hora] of PALABRAS_HORA) if (re.test(frecuencia)) horas.add(hora)
  return Array.from(horas).sort()
}

export async function exportarPdfMedico(
  expedientes: Expediente[],
  edicion: CampusEdicion | null
): Promise<void> {
  const { jsPDF, autoTable } = await loadPdf()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  type Fila = {
    expediente: Expediente
    med: MedItem
    horas: string[]
    prn: boolean
  }

  const filas: Fila[] = []
  for (const e of expedientes) {
    for (const med of medicamentosCampus(e)) {
      const horas =
        med.horarios.length > 0
          ? [...med.horarios].sort()
          : med.prn
            ? []
            : extraerHoras(med.frecuenciaLegacy)
      filas.push({ expediente: e, med, horas, prn: med.prn })
    }
  }
  filas.sort((a, b) =>
    nombreCompleto(a.expediente).localeCompare(nombreCompleto(b.expediente), 'es')
  )

  const ninosUnicos = new Set(filas.map((f) => f.expediente.id)).size
  pintarCabecera(
    doc,
    edicion,
    'Hoja médica — Administración de medicación',
    `Generado el ${new Date().toLocaleDateString('es-ES')}. ${ninosUnicos} participante(s) con medicación pautada, ${filas.length} medicamento(s).`
  )

  if (filas.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(11)
    doc.text(
      'Ningún participante tiene medicación pautada durante el Campus.',
      14,
      44
    )
    descargarBlob(doc, nombreArchivo('medico', edicion, expedientes))
    return
  }

  const horarioCelda = (f: Fila): string => {
    const partes: string[] = []
    if (f.med.horarios.length > 0) partes.push(f.med.horarios.join(', '))
    if (f.prn) partes.push('según necesidad')
    if (partes.length > 0) return partes.join(' + ')
    return f.med.frecuenciaLegacy || '—'
  }

  // ---- Sección 1: tabla individual ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('1. Medicación por participante', 14, 38)

  let lastId: string | null = null
  const cuerpoIndividual = filas.map((f) => {
    const mismo = f.expediente.id === lastId
    lastId = f.expediente.id
    return [
      mismo ? '' : nombreCompleto(f.expediente),
      mismo ? '' : calcularEdad(f.expediente.fecha_nacimiento, edicion?.fecha_inicio),
      f.med.nombre || '—',
      f.med.dosis || '—',
      horarioCelda(f),
      f.med.indicaciones,
      mismo ? '' : contactoPrincipal(f.expediente),
    ]
  })

  autoTable(doc, {
    startY: 42,
    head: [['Niño/a', 'Edad', 'Medicamento', 'Dosis', 'Horario', 'Indicaciones', 'Contacto']],
    body: cuerpoIndividual,
    headStyles: { fillColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TXT, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: COLOR_BODY_TXT },
    styles: { cellPadding: 1.5 },
    margin: { left: 14, right: 14 },
  })

  // ---- Sección 2: tabla por horario ----
  const PRN = '__prn__'
  const SIN_HORARIO = '__sin__'
  const porHora = new Map<string, Fila[]>()
  const push = (k: string, f: Fila) => {
    const a = porHora.get(k) ?? []
    a.push(f)
    porHora.set(k, a)
  }
  for (const f of filas) {
    if (f.horas.length > 0) for (const h of f.horas) push(h, f)
    if (f.prn) push(PRN, f)
    if (f.horas.length === 0 && !f.prn) push(SIN_HORARIO, f)
  }
  const claves = Array.from(porHora.keys())
    .filter((k) => k !== PRN && k !== SIN_HORARIO)
    .sort()
  if (porHora.has(PRN)) claves.push(PRN)
  if (porHora.has(SIN_HORARIO)) claves.push(SIN_HORARIO)

  const cuerpoHorario: string[][] = []
  for (const k of claves) {
    const items = (porHora.get(k) ?? []).slice().sort((a, b) =>
      nombreCompleto(a.expediente).localeCompare(nombreCompleto(b.expediente), 'es')
    )
    let primera = true
    for (const f of items) {
      const etiqueta =
        k === PRN ? 'Según necesidad' : k === SIN_HORARIO ? 'Sin horario' : k
      cuerpoHorario.push([
        primera ? etiqueta : '',
        nombreCompleto(f.expediente),
        f.med.nombre || '—',
        f.med.dosis || '—',
        k === SIN_HORARIO
          ? [
              f.med.frecuenciaLegacy ? `Frecuencia: ${f.med.frecuenciaLegacy}` : '',
              f.med.indicaciones,
            ]
              .filter(Boolean)
              .join(' — ')
          : f.med.indicaciones,
      ])
      primera = false
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY1 = (doc as any).lastAutoTable?.finalY ?? 42
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('2. Calendario por horario', 14, finalY1 + 10)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_GREY_TXT)
  doc.text(
    'Cada hora agrupa los niños que reciben su medicación en esa franja. "Según necesidad" recoge la medicación sin horario fijo.',
    14,
    finalY1 + 14
  )
  doc.setTextColor(...COLOR_BODY_TXT)
  doc.setFont('helvetica', 'normal')

  autoTable(doc, {
    startY: finalY1 + 18,
    head: [['Hora', 'Niño/a', 'Medicamento', 'Dosis', 'Indicaciones']],
    body: cuerpoHorario,
    headStyles: { fillColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TXT, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: COLOR_BODY_TXT },
    styles: { cellPadding: 1.5 },
    margin: { left: 14, right: 14 },
  })

  descargarBlob(doc, nombreArchivo('medico', edicion, expedientes))
}

// ===========================================================================
// 5) Log de actividad
// ===========================================================================

function fmtFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function descripcionPdf(p: EventoPdfRow): string {
  const doc = String(p.payload?.doc ?? '?')
  const tipoSel = p.payload?.tipoSel ? String(p.payload.tipoSel) : 'todos'
  const programaSel = p.payload?.programaSel
    ? String(p.payload.programaSel)
    : 'todos'
  const n = typeof p.payload?.n === 'number' ? p.payload.n : '?'
  return `${doc.toUpperCase()} · tipo=${tipoSel} · programa=${programaSel} · ${n} expedientes`
}

export async function exportarPdfLog(
  formularios: FormularioEnviadoRow[],
  pdfsGenerados: EventoPdfRow[],
  edicion: CampusEdicion | null
): Promise<void> {
  const { jsPDF, autoTable } = await loadPdf()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  pintarCabecera(
    doc,
    edicion,
    'Log de actividad — Registro acumulativo',
    `Generado el ${new Date().toLocaleDateString('es-ES')}. Histórico completo desde el inicio del proyecto.`
  )

  // ---- Sección 1: formularios enviados a familias --------------------------
  let y = 38
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(
    `1. Formularios enviados a familias (${formularios.length})`,
    14,
    y
  )

  if (formularios.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...COLOR_GREY_TXT)
    doc.text('Aún no se ha enviado ningún formulario.', 14, y + 6)
    doc.setTextColor(...COLOR_BODY_TXT)
    y = y + 14
  } else {
    autoTable(doc, {
      startY: y + 4,
      head: [['Fecha', 'Nº', 'Niño/a', 'Email tutor', 'Programa', 'Enviado por']],
      body: formularios.map((f) => [
        fmtFecha(f.formulario_enviado_at),
        f.numero_participante ?? '—',
        `${f.alumno_nombre ?? ''} ${f.alumno_apellidos ?? ''}`.trim() || '—',
        f.tutor_email ?? '—',
        f.programa ?? '—',
        f.formulario_enviado_por ?? '—',
      ]),
      headStyles: {
        fillColor: COLOR_HEADER_BG,
        textColor: COLOR_HEADER_TXT,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8, textColor: COLOR_BODY_TXT },
      styles: { cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY ?? y + 4
  }

  // ---- Sección 2: documentos PDF generados ---------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLOR_BODY_TXT)
  doc.text(
    `2. Documentos PDF generados (${pdfsGenerados.length})`,
    14,
    y + 10
  )

  if (pdfsGenerados.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...COLOR_GREY_TXT)
    doc.text('Aún no se ha generado ningún PDF de gestión.', 14, y + 16)
  } else {
    autoTable(doc, {
      startY: y + 14,
      head: [['Fecha', 'Documento', 'Generado por']],
      body: pdfsGenerados.map((p) => [
        fmtFecha(p.created_at),
        descripcionPdf(p),
        p.actor ?? '—',
      ]),
      headStyles: {
        fillColor: COLOR_HEADER_BG,
        textColor: COLOR_HEADER_TXT,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8, textColor: COLOR_BODY_TXT },
      styles: { cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    })
  }

  const fecha = new Date().toISOString().slice(0, 10)
  const slugEd = slugify(edicion?.nombre ?? 'expedientes')
  doc.save(`${slugEd}-log-actividad-${fecha}.pdf`)
}
