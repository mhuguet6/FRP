import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaffStatus } from '../../lib/useStaffStatus'
import {
  getEdicionActiva,
  type CampusEdicion,
} from '../../features/expediente/api'
import {
  crearInvitacionesYEnviar,
  parseExcelInvitaciones,
  type FilaParseada,
  type ProgramaTipo,
  type ResultadoEnvio,
} from '../../features/backoffice/invitacionesImport'
import { PageSpinner } from '../../components/ui/PageSpinner'

export function BackofficeInvitaciones() {
  const staff = useStaffStatus()
  const inputRef = useRef<HTMLInputElement>(null)
  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [filas, setFilas] = useState<FilaParseada[] | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [programaPorDefecto, setProgramaPorDefecto] =
    useState<ProgramaTipo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parseando, setParseando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoEnvio[] | null>(null)

  useEffect(() => {
    if (staff.status !== 'staff') return
    getEdicionActiva()
      .then(setEdicion)
      .catch((e) => setError(e.message))
  }, [staff.status])

  const onArchivoSeleccionado = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setArchivo(file)
    setFilas(null)
    setAvisos([])
    setResultados(null)
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
      setError(err instanceof Error ? err.message : 'Error al leer el archivo')
    } finally {
      setParseando(false)
    }
  }

  // Si cambian el "programa por defecto" después de parsear, aplicamos a las
  // filas que aún no tenían programa
  useEffect(() => {
    if (!filas || !programaPorDefecto) return
    setFilas(
      filas.map((f) => (f.programa ? f : { ...f, programa: programaPorDefecto }))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programaPorDefecto])

  const stats = useMemo(() => {
    if (!filas) return null
    const validas = filas.filter((f) => f.errores.length === 0)
    const conError = filas.length - validas.length
    const emails = new Set(validas.map((f) => f.email))
    return {
      total: filas.length,
      validas: validas.length,
      conError,
      emailsUnicos: emails.size,
    }
  }, [filas])

  const onEnviar = async () => {
    if (!filas) return
    setEnviando(true)
    setError(null)
    try {
      const redirectTo = `${window.location.origin}/callback`
      const res = await crearInvitacionesYEnviar(
        filas,
        edicion?.id ?? null,
        redirectTo
      )
      setResultados(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setEnviando(false)
    }
  }

  if (staff.status === 'loading') return <PageSpinner />
  if (staff.status === 'not_staff') {
    return (
      <Centered>
        <p className="text-red-700 text-sm">No tienes acceso al backoffice.</p>
        <Link
          to="/mis-expedientes"
          className="inline-block mt-3 text-slate-900 underline text-sm"
        >
          Volver
        </Link>
      </Centered>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/admin"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Listado
          </Link>
          {edicion && (
            <span className="text-xs text-slate-500">{edicion.nombre}</span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Invitar familias
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Sube el Excel que envía la clienta. Se crea una invitación por fila
            y se manda un magic link a cada email único.
          </p>
        </div>

        {/* Paso 1: Programa por defecto */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            1. Programa por defecto
          </h2>
          <p className="text-sm text-slate-600">
            Se aplica a todas las filas que no tengan columna "Programa" en el
            Excel.
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

        {/* Paso 2: Subir archivo */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            2. Subir Excel
          </h2>
          <p className="text-sm text-slate-600">
            Formato esperado: una fila por participante. Columnas reconocidas:
            <em> nombre, apellidos, correo, fecha nac, dirección completa,
            padres, programa, género, edad, chozo, repetidor/a, centro
            educativo, profesiones, importe</em>. Las desconocidas se guardan
            como datos internos.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={parseando}
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

        {/* Paso 3: Preview */}
        {filas && stats && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              3. Revisar
            </h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                {stats.total} filas detectadas
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                {stats.validas} listas
              </span>
              {stats.conError > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">
                  {stats.conError} con error
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                {stats.emailsUnicos} emails únicos
              </span>
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
                  {filas.map((f) => (
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
                        {f.programa ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {f.errores.length > 0 ? (
                          <span
                            className="text-red-700 text-xs"
                            title={f.errores.join('. ')}
                          >
                            ⚠ {f.errores[0]}
                          </span>
                        ) : (
                          <span className="text-emerald-700 text-xs">
                            ✓ Lista
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Paso 4: Enviar */}
        {filas && stats && stats.validas > 0 && !resultados && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              4. Enviar invitaciones
            </h2>
            <p className="text-sm text-slate-600">
              Se enviará un email con magic link a cada uno de los{' '}
              <strong>{stats.emailsUnicos}</strong> correos únicos. Las filas
              con error se omiten.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">
              ⚠ Si Supabase no tiene custom SMTP configurado, el rate limit por
              defecto es bajo (~4 emails/hora). Para envíos masivos conviene
              configurar Resend o similar en{' '}
              <em>Supabase → Project Settings → Auth → SMTP Settings</em>.
            </p>
            <button
              type="button"
              onClick={onEnviar}
              disabled={enviando}
              className="rounded-lg bg-emerald-700 text-white font-medium px-4 py-2.5 hover:bg-emerald-800 disabled:opacity-50"
            >
              {enviando
                ? 'Enviando…'
                : `Enviar ${stats.emailsUnicos} invitaciones`}
            </button>
          </div>
        )}

        {/* Resultados */}
        {resultados && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              Resultado del envío
            </h2>
            <div className="flex gap-3 text-sm">
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                {resultados.filter((r) => r.ok).length} enviados
              </span>
              {resultados.filter((r) => !r.ok).length > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">
                  {resultados.filter((r) => !r.ok).length} con error
                </span>
              )}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Filas</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r) => (
                    <tr
                      key={r.email}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-2 text-slate-700">{r.email}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {r.filas.join(', ')}
                      </td>
                      <td className="px-3 py-2">
                        {r.ok ? (
                          <span className="text-emerald-700 text-xs">
                            ✓ Enviado
                          </span>
                        ) : (
                          <span className="text-red-700 text-xs">
                            ⚠ {r.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-6 max-w-md w-full text-center">
        {children}
      </div>
    </div>
  )
}
