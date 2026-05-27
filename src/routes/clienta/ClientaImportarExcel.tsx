import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useClientaStatus } from '../../lib/useClientaStatus'
import {
  crearExpedienteDesdeClienta,
  getEdicionActiva,
  type CampusEdicion,
  type DatosNinoClienta,
  type ProgramaTipo,
} from '../../features/expediente/api'
import {
  parseExcelInvitaciones,
  type FilaParseada,
} from '../../features/backoffice/invitacionesImport'
import { PageSpinner } from '../../components/ui/PageSpinner'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

function get(dc: R, k: string): string | null {
  const v = dc[k]
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s ? s : null
}

function filaADatos(
  f: FilaParseada,
  programaPorDefecto: ProgramaTipo | null
): DatosNinoClienta | null {
  const programa = f.programa ?? programaPorDefecto
  if (!programa) return null
  if (!f.email || !f.alumno_nombre || !f.alumno_apellidos) return null
  const dc = f.datos_clienta ?? {}
  const edadStr = get(dc, 'edad')
  return {
    alumno_nombre: f.alumno_nombre,
    alumno_apellidos: f.alumno_apellidos,
    programa,
    tutor_email: f.email,
    fecha_nacimiento: f.fecha_nacimiento,
    direccion: f.direccion ?? '',
    genero: get(dc, 'genero'),
    edad: edadStr ? parseInt(edadStr, 10) || null : null,
    chozo: get(dc, 'chozo'),
    repetidor: get(dc, 'repetidor'),
    centro_educativo: get(dc, 'centro_educativo'),
    padres: get(dc, 'padres'),
    profesiones: get(dc, 'profesiones'),
    importe: get(dc, 'importe'),
    observaciones: get(dc, 'observaciones') ?? get(dc, 'notas'),
  }
}

export function ClientaImportarExcel() {
  const clienta = useClientaStatus()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [filas, setFilas] = useState<FilaParseada[] | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [programaPorDefecto, setProgramaPorDefecto] =
    useState<ProgramaTipo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parseando, setParseando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [resultado, setResultado] = useState<{
    creados: number
    fallidos: number
  } | null>(null)

  useEffect(() => {
    if (clienta.status !== 'clienta') return
    getEdicionActiva()
      .then(setEdicion)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [clienta.status])

  // Re-aplicar programa por defecto a filas sin programa
  useEffect(() => {
    if (!filas || !programaPorDefecto) return
    setFilas(
      filas.map((f) => (f.programa ? f : { ...f, programa: programaPorDefecto }))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programaPorDefecto])

  const stats = useMemo(() => {
    if (!filas) return null
    const conPrograma = filas.filter(
      (f) => f.errores.length === 0 && (f.programa ?? programaPorDefecto)
    )
    const sinPrograma = filas.filter(
      (f) => f.errores.length === 0 && !(f.programa ?? programaPorDefecto)
    )
    const conError = filas.filter((f) => f.errores.length > 0)
    return {
      total: filas.length,
      validas: conPrograma.length,
      sinPrograma: sinPrograma.length,
      conError: conError.length,
    }
  }, [filas, programaPorDefecto])

  if (clienta.status === 'loading') return <PageSpinner />
  if (clienta.status === 'not_clienta') return <Navigate to="/" replace />

  const onArchivoSeleccionado = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setArchivo(file)
    setFilas(null)
    setAvisos([])
    setResultado(null)
    setError(null)
    setParseando(true)
    try {
      const { filas, avisos } = await parseExcelInvitaciones(
        file,
        programaPorDefecto
      )
      setFilas(filas)
      setAvisos(avisos)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Detectamos errores típicos de ExcelJS con archivos que tienen
      // imágenes, logos o gráficos embebidos.
      const esImagenError =
        /anchors|drawing|image|chart|pivot/i.test(msg) ||
        /Cannot read propert(?:y|ies)/i.test(msg)
      if (esImagenError) {
        setError(
          'No hemos podido leer el archivo. Suele pasar cuando el Excel ' +
            'tiene imágenes, logos, gráficos o tablas con formato. ' +
            'Solución rápida: copia las filas con datos en una hoja Excel ' +
            'nueva en blanco (Pegado especial → Valores) y vuelve a subirla.'
        )
      } else {
        setError(`Error al leer el archivo: ${msg}`)
      }
    } finally {
      setParseando(false)
    }
  }

  const onCrear = async () => {
    if (!filas) return
    setCreando(true)
    setError(null)
    let creados = 0
    let fallidos = 0
    for (const f of filas) {
      if (f.errores.length > 0) continue
      const datos = filaADatos(f, programaPorDefecto)
      if (!datos) {
        fallidos++
        continue
      }
      try {
        await crearExpedienteDesdeClienta(datos, edicion?.id ?? null)
        creados++
      } catch (err) {
        console.warn('[importar fila]', f.rowNumber, err)
        fallidos++
      }
    }
    setCreando(false)
    setResultado({ creados, fallidos })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/clienta"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Volver
          </Link>
          {edicion && (
            <span className="text-xs text-slate-500">{edicion.nombre}</span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Subir Excel de inscripciones
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Una fila por niño/a. Columnas reconocidas: <em>apellidos, nombre,
            género, edad, chozo, repetidor/a, correo, fecha nac, centro
            educativo, padres, profesiones, dirección completa, importe,
            programa</em>. Las columnas que no reconozcamos se guardarán como
            datos internos.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            1. Programa por defecto
          </h2>
          <p className="text-sm text-slate-600">
            Se aplica a las filas que no tengan la columna "Programa". Si tu
            Excel ya trae programa por niño, no hace falta tocarlo.
          </p>
          <div className="flex gap-3">
            {[
              { value: 'robotica' as const, label: 'Robótica' },
              { value: 'emprendimiento' as const, label: 'Emprendimiento' },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setProgramaPorDefecto(p.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border ${
                  programaPorDefecto === p.value
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
            {programaPorDefecto && (
              <button
                type="button"
                onClick={() => setProgramaPorDefecto(null)}
                className="text-xs text-slate-600 underline ml-1"
              >
                Quitar
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            2. Subir Excel
          </h2>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={parseando || creando}
            className="rounded-lg border border-dashed border-slate-300 text-slate-700 font-medium px-4 py-3 hover:bg-slate-50 disabled:opacity-50"
          >
            {parseando
              ? 'Leyendo…'
              : archivo
                ? `Cambiar archivo (actual: ${archivo.name})`
                : '+ Seleccionar archivo .xlsx'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={onArchivoSeleccionado}
          />
        </div>

        {filas && stats && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">3. Revisar</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                {stats.total} filas detectadas
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                {stats.validas} listas
              </span>
              {stats.sinPrograma > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800">
                  {stats.sinPrograma} sin programa
                </span>
              )}
              {stats.conError > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">
                  {stats.conError} con error
                </span>
              )}
            </div>

            {avisos.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 space-y-1">
                {avisos.map((a, i) => (
                  <div key={i}>{a}</div>
                ))}
              </div>
            )}

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Alumno/a</th>
                    <th className="px-3 py-2">Email tutor</th>
                    <th className="px-3 py-2">Programa</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const prog = f.programa ?? programaPorDefecto
                    return (
                      <tr
                        key={f.rowNumber}
                        className={`border-b border-slate-100 last:border-0 ${
                          f.errores.length > 0 ? 'bg-red-50/50' : ''
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {f.rowNumber}
                        </td>
                        <td className="px-3 py-2">
                          {`${f.alumno_nombre ?? ''} ${f.alumno_apellidos ?? ''}`.trim() ||
                            '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {f.email ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {prog ?? (
                            <span className="text-amber-700">— elige arriba</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {f.errores.length > 0 ? (
                            <span
                              className="text-red-700 text-xs"
                              title={f.errores.join('. ')}
                            >
                              ⚠ {f.errores[0]}
                            </span>
                          ) : prog ? (
                            <span className="text-emerald-700 text-xs">
                              ✓ Lista
                            </span>
                          ) : (
                            <span className="text-amber-700 text-xs">
                              Sin programa
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {filas && stats && stats.validas > 0 && !resultado && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              4. Crear expedientes
            </h2>
            <p className="text-sm text-slate-600">
              Se crearán <strong>{stats.validas}</strong> expedientes con su
              información básica.
            </p>
            <button
              type="button"
              onClick={onCrear}
              disabled={creando}
              className="rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800 disabled:opacity-50"
            >
              {creando
                ? 'Creando…'
                : `Crear ${stats.validas} expedientes`}
            </button>
          </div>
        )}

        {resultado && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              Resultado
            </h2>
            <div className="flex gap-3 text-sm">
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                {resultado.creados} creados
              </span>
              {resultado.fallidos > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">
                  {resultado.fallidos} fallaron
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate('/clienta', { replace: true })}
              className="rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800"
            >
              Volver al panel
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">
            {error}
          </div>
        )}
      </main>
    </div>
  )
}
