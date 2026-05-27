import type { Expediente, CampusEdicion } from '../expediente/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

const estadoLabel: Record<string, string> = {
  creado: 'Sin empezar',
  en_progreso: 'En progreso',
  pendiente_de_firma: 'Falta firma',
  enviado: 'Enviado',
  validado: 'Validado',
  requiere_correccion: 'Necesita corrección',
  cerrado: 'Cerrado',
}

function calcularEdad(fechaNac: string | null, fechaInicio: string | null): string {
  if (!fechaNac || !fechaInicio) return ''
  const nac = new Date(fechaNac)
  const ini = new Date(fechaInicio)
  if (Number.isNaN(nac.getTime()) || Number.isNaN(ini.getTime())) return ''
  let edad = ini.getFullYear() - nac.getFullYear()
  const m = ini.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && ini.getDate() < nac.getDate())) edad--
  return String(edad)
}

function fmtNoSi(v: R | undefined): string {
  if (!v?.respuesta) return ''
  if (v.respuesta === 'no') return 'No'
  const det = (v.detalle as string | undefined) ?? ''
  return det ? `Sí — ${det}` : 'Sí'
}

function fmtBoolConFallback(
  columna: boolean | null | undefined,
  respuestaJson: string | undefined
): string {
  if (columna === true) return 'Sí'
  if (columna === false) return 'No'
  if (respuestaJson === 'si') return 'Sí'
  if (respuestaJson === 'no') return 'No'
  return ''
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtHorarioMed(m: R): string {
  const horarios = Array.isArray(m.horarios) ? (m.horarios as string[]) : []
  const partes: string[] = []
  if (horarios.length > 0) partes.push(horarios.join(', '))
  if (m.prn === true) partes.push('según necesidad')
  if (partes.length > 0) return partes.join(' + ')
  // Fallback al campo libre antiguo si existiera.
  return typeof m.frecuencia === 'string' ? m.frecuencia.trim() : ''
}

function fmtMedicamentos(lista: Array<R> | undefined): string {
  if (!lista?.length) return ''
  return lista
    .map((m) => {
      const parts = [m.nombre, m.dosis, fmtHorarioMed(m)].filter(
        (p) => p && String(p).trim()
      )
      const indic = m.indicaciones ? ` [${m.indicaciones}]` : ''
      return parts.join(' / ') + indic
    })
    .join(' · ')
}

function fmtContactos(lista: Array<R> | undefined, idx: number): string {
  const c = lista?.[idx]
  if (!c) return ''
  return [c.telefono, c.nombre, c.relacion]
    .filter((p) => p && String(p).trim())
    .join(' — ')
}

const COLUMNAS: Array<{
  key: string
  header: string
  width: number
  get: (e: Expediente, edicion: CampusEdicion | null) => string
}> = [
  { key: 'id', header: 'ID', width: 38, get: (e) => e.id },
  {
    key: 'programa',
    header: 'Programa',
    width: 16,
    get: (e) =>
      e.programa === 'robotica'
        ? 'Robótica'
        : e.programa === 'emprendimiento'
          ? 'Emprendimiento'
          : '',
  },
  { key: 'estado', header: 'Estado', width: 18, get: (e) => estadoLabel[e.estado] ?? e.estado },
  { key: 'created_at', header: 'Creado', width: 16, get: (e) => fmtFecha(e.created_at) },
  { key: 'submitted_at', header: 'Enviado', width: 16, get: (e) => fmtFecha(e.submitted_at) },
  {
    key: 'alumno_nombre',
    header: 'Nombre',
    width: 16,
    get: (e) =>
      e.alumno_nombre ??
      ((e.respuestas as R | undefined)?.seccion1?.nombre as string | undefined) ??
      '',
  },
  {
    key: 'alumno_apellidos',
    header: 'Apellidos',
    width: 22,
    get: (e) =>
      e.alumno_apellidos ??
      ((e.respuestas as R | undefined)?.seccion1?.apellidos as string | undefined) ??
      '',
  },
  {
    key: 'fecha_nacimiento',
    header: 'Fecha nacimiento',
    width: 14,
    get: (e) =>
      e.fecha_nacimiento ??
      ((e.respuestas as R | undefined)?.seccion1?.fecha_nacimiento as
        | string
        | undefined) ??
      '',
  },
  {
    key: 'edad',
    header: 'Edad inicio Campus',
    width: 8,
    get: (e, ed) => calcularEdad(e.fecha_nacimiento, ed?.fecha_inicio ?? null),
  },
  {
    key: 'curso',
    header: 'Curso (sept)',
    width: 14,
    get: (e) =>
      e.curso ??
      ((e.respuestas as R | undefined)?.seccion5?.participante?.curso as
        | string
        | undefined) ??
      '',
  },
  {
    key: 'direccion',
    header: 'Dirección',
    width: 28,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion1?.direccion as string) ?? '',
  },
  {
    key: 'tutor_nombre',
    header: 'Tutor/a',
    width: 22,
    get: (e) =>
      e.tutor_nombre ??
      ((e.respuestas as R | undefined)?.seccion2?.tutor_nombre as string | undefined) ??
      '',
  },
  {
    key: 'tutor_dni',
    header: 'DNI tutor/a',
    width: 14,
    get: (e) =>
      e.tutor_dni ??
      ((e.respuestas as R | undefined)?.seccion2?.tutor_dni as string | undefined) ??
      '',
  },
  {
    key: 'tutor_email',
    header: 'Email tutor/a',
    width: 26,
    get: (e) =>
      e.tutor_email ??
      ((e.respuestas as R | undefined)?.seccion2?.email_contacto as string | undefined) ??
      '',
  },
  {
    key: 'contacto1',
    header: 'Contacto 1',
    width: 30,
    get: (e) =>
      fmtContactos(
        (e.respuestas as R | undefined)?.seccion2?.contactos as Array<R>,
        0
      ),
  },
  {
    key: 'contacto2',
    header: 'Contacto 2',
    width: 30,
    get: (e) =>
      fmtContactos(
        (e.respuestas as R | undefined)?.seccion2?.contactos as Array<R>,
        1
      ),
  },
  {
    key: 'contacto3',
    header: 'Contacto 3',
    width: 30,
    get: (e) =>
      fmtContactos(
        (e.respuestas as R | undefined)?.seccion2?.contactos as Array<R>,
        2
      ),
  },
  {
    key: 'tiene_alergias',
    header: 'Tiene alergias',
    width: 12,
    get: (e) =>
      fmtBoolConFallback(
        e.tiene_alergias,
        (e.respuestas as R | undefined)?.seccion3?.alergias?.respuesta as
          | string
          | undefined
      ),
  },
  {
    key: 'detalle_alergias',
    header: 'Detalle alergias',
    width: 26,
    get: (e) =>
      e.detalle_alergias ??
      ((e.respuestas as R | undefined)?.seccion3?.alergias?.que as
        | string
        | undefined) ??
      '',
  },
  {
    key: 'reaccion_alergias',
    header: 'Reacción alergias',
    width: 22,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion3?.alergias?.reaccion as string) ??
      '',
  },
  {
    key: 'dieta_especial',
    header: 'Dieta especial',
    width: 22,
    get: (e) =>
      fmtNoSi((e.respuestas as R | undefined)?.seccion3?.alimentacion?.dieta),
  },
  {
    key: 'come',
    header: 'Come',
    width: 12,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion3?.alimentacion?.come as string) ??
      '',
  },
  {
    key: 'peso',
    header: 'Peso (kg)',
    width: 10,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion3?.alimentacion?.peso_kg as string) ??
      '',
  },
  {
    key: 'mareos',
    header: 'Mareos',
    width: 20,
    get: (e) => fmtNoSi((e.respuestas as R | undefined)?.seccion3?.mareos),
  },
  {
    key: 'medicacion_campus',
    header: 'Medicación durante Campus',
    width: 14,
    get: (e) =>
      fmtBoolConFallback(
        e.tiene_medicacion,
        (e.respuestas as R | undefined)?.seccion4?.durante_campus
          ?.respuesta as string | undefined
      ),
  },
  {
    key: 'medicamentos_campus',
    header: 'Medicamentos durante Campus',
    width: 40,
    get: (e) =>
      fmtMedicamentos(
        (e.respuestas as R | undefined)?.seccion4?.durante_campus?.medicamentos
      ),
  },
  {
    key: 'medicacion_habitual',
    header: 'Medicación habitual',
    width: 40,
    get: (e) =>
      fmtMedicamentos(
        (e.respuestas as R | undefined)?.seccion4?.habitual?.medicamentos
      ),
  },
  {
    key: 'discapacidad',
    header: 'Discapacidad',
    width: 22,
    get: (e) => fmtNoSi((e.respuestas as R | undefined)?.seccion3?.discapacidad),
  },
  {
    key: 'movilidad',
    header: 'Movilidad',
    width: 22,
    get: (e) => fmtNoSi((e.respuestas as R | undefined)?.seccion3?.movilidad),
  },
  {
    key: 'motricidad',
    header: 'Motricidad',
    width: 22,
    get: (e) => fmtNoSi((e.respuestas as R | undefined)?.seccion3?.motricidad),
  },
  {
    key: 'gafas',
    header: 'Gafas o lentillas',
    width: 22,
    get: (e) =>
      fmtNoSi((e.respuestas as R | undefined)?.seccion3?.gafas_lentillas),
  },
  {
    key: 'miedos',
    header: 'Miedos',
    width: 26,
    get: (e) => fmtNoSi((e.respuestas as R | undefined)?.seccion3?.miedos),
  },
  {
    key: 'caracter',
    header: 'Carácter',
    width: 26,
    get: (e) => fmtNoSi((e.respuestas as R | undefined)?.seccion3?.caracter),
  },
  {
    key: 'atencion_especial',
    header: 'Atención especial',
    width: 26,
    get: (e) =>
      fmtNoSi((e.respuestas as R | undefined)?.seccion3?.atencion_especial),
  },
  {
    key: 'nivel_natacion',
    header: 'Nivel natación',
    width: 14,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion6?.nivel_natacion?.nivel as string) ??
      '',
  },
  {
    key: 'agua_limitacion',
    header: 'Limitación en agua',
    width: 22,
    get: (e) => fmtNoSi((e.respuestas as R | undefined)?.seccion6?.agua),
  },
  {
    key: 'imagen',
    header: 'Derechos de imagen',
    width: 22,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion6?.imagen?.decision as string) ??
      '',
  },
  {
    key: 'comunicaciones',
    header: 'Comunicaciones',
    width: 16,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion6?.comunicaciones as string) ??
      '',
  },
  {
    key: 'observaciones',
    header: 'Observaciones del tutor',
    width: 40,
    get: (e) =>
      fmtNoSi(
        (e.respuestas as R | undefined)?.seccion6?.observaciones_generales
      ),
  },
  // Preguntas extra del programa Emprendimiento (vacías si Robótica)
  {
    key: 'emprend_participante',
    header: 'Emprendimiento — Idea del/de la participante',
    width: 40,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion5?.participante?.emprendimiento as
        | string
        | undefined) ?? '',
  },
  {
    key: 'emprend_familia',
    header: 'Emprendimiento — Expectativas de la familia',
    width: 40,
    get: (e) =>
      ((e.respuestas as R | undefined)?.seccion5?.familia?.emprendimiento as
        | string
        | undefined) ?? '',
  },
]

export async function exportarExcel(
  expedientes: Expediente[],
  edicion: CampusEdicion | null,
  nombreEdicion: string = 'expedientes'
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Campus FRP'
  wb.created = new Date()

  const ws = wb.addWorksheet('Expedientes', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.columns = COLUMNAS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }))

  expedientes.forEach((e) => {
    const row: Record<string, string> = {}
    COLUMNAS.forEach((c) => {
      row[c.key] = c.get(e, edicion)
    })
    ws.addRow(row)
  })

  // Estilos cabecera
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 22

  // Bordes y wrap
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      }
    })
  }

  // Auto-filtro
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNAS.length },
  }

  // Descargar
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const fecha = new Date().toISOString().slice(0, 10)
  const slug = nombreEdicion.replace(/\s+/g, '-').toLowerCase()
  // Detectamos programa(s) en el filtro actual para reflejarlo en el nombre.
  const progs = new Set<string>()
  for (const e of expedientes) if (e.programa) progs.add(e.programa)
  const slugProg =
    progs.size === 0
      ? 'sin-programa'
      : progs.size === 1
        ? Array.from(progs)[0]
        : 'todos'
  a.download = `${slug}-${slugProg}-${fecha}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
