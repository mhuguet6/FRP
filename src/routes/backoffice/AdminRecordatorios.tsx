import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useSession } from '../../lib/useSession'
import { useStaffStatus } from '../../lib/useStaffStatus'
import {
  enviarRecordatorios,
  listarPendientesRecordatorio,
  type PendienteRecordatorio,
} from '../../features/expediente/api'
import { PageSpinner } from '../../components/ui/PageSpinner'

const TOTAL_SECCIONES = 7

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export function AdminRecordatorios() {
  const staff = useStaffStatus()
  const session = useSession()
  const staffEmail = session.session?.user.email ?? 'admin'

  const [pendientes, setPendientes] = useState<PendienteRecordatorio[] | null>(
    null
  )
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [programaFiltro, setProgramaFiltro] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const cargar = async () => {
    try {
      const lista = await listarPendientesRecordatorio()
      setPendientes(lista)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    }
  }

  useEffect(() => {
    if (staff.status !== 'staff') return
    cargar()
  }, [staff.status])

  const filtrados = useMemo(() => {
    if (!pendientes) return []
    if (programaFiltro.length === 0) return pendientes
    return pendientes.filter((p) => {
      const prog = p.expediente.programa ?? 'sin_programa'
      return programaFiltro.includes(prog)
    })
  }, [pendientes, programaFiltro])

  const toggleUno = (id: string) => {
    setSeleccion((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const marcarTodos = () =>
    setSeleccion(new Set(filtrados.map((p) => p.expediente.id)))
  const desmarcarTodos = () => setSeleccion(new Set())

  if (staff.status === 'loading') return <PageSpinner />
  if (staff.status === 'not_staff') return <Navigate to="/" replace />

  const seleccionados = filtrados.filter((p) => seleccion.has(p.expediente.id))

  const onEnviar = async () => {
    if (seleccionados.length === 0) return
    setEnviando(true)
    setError(null)
    setInfo(null)
    try {
      const redirectTo = `${window.location.origin}/callback`
      const expedientes = seleccionados.map((s) => s.expediente)
      const res = await enviarRecordatorios(expedientes, redirectTo, staffEmail)
      const ok = res.filter((r) => r.ok).length
      const fallos = res.filter((r) => !r.ok)
      if (fallos.length === 0) {
        setInfo(`Recordatorio enviado a ${ok} familia(s).`)
      } else {
        setError(
          `Se enviaron ${ok}, fallaron ${fallos.length}: ${fallos
            .map((f) => `${f.email || '(sin email)'} → ${f.error}`)
            .join('; ')}`
        )
      }
      setSeleccion(new Set())
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/admin" className="text-sm text-slate-600 hover:text-slate-900">
            ← Listado
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Recordatorios
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Familias que recibieron el formulario y aún no lo han completado.
            Reenvía el correo de acceso para que retomen donde lo dejaron.
          </p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3">
          ⚠ Sin Resend configurado, Supabase Auth limita el envío a ~4 emails
          por hora. Si tienes muchos pendientes, envía en lotes o configura
          Resend en Supabase → Settings → Auth → SMTP para subir el límite.
        </div>

        {/* Filtro programa */}
        {pendientes && pendientes.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Programa
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { v: 'robotica', label: 'Robótica' },
                  { v: 'emprendimiento', label: 'Emprendimiento' },
                ] as const
              ).map((p) => {
                const activo = programaFiltro.includes(p.v)
                return (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() =>
                      setProgramaFiltro((cur) =>
                        activo ? cur.filter((s) => s !== p.v) : [...cur, p.v]
                      )
                    }
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      activo
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3">
            {info}
          </div>
        )}

        {pendientes === null ? (
          <div className="text-slate-500 text-sm">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-600 text-sm">
            No hay familias pendientes con los filtros actuales.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 flex-wrap">
              <div className="text-sm text-slate-700">
                {seleccion.size > 0
                  ? `${seleccion.size} seleccionada(s)`
                  : `${filtrados.length} pendiente(s)`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={
                    seleccion.size === filtrados.length
                      ? desmarcarTodos
                      : marcarTodos
                  }
                  className="text-xs text-slate-600 underline"
                >
                  {seleccion.size === filtrados.length
                    ? 'Desmarcar todos'
                    : 'Marcar todos'}
                </button>
                <button
                  type="button"
                  onClick={onEnviar}
                  disabled={enviando || seleccion.size === 0}
                  className="text-sm font-medium rounded-lg bg-blue-700 text-white px-3 py-1.5 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enviando
                    ? 'Enviando…'
                    : `↗ Enviar recordatorio a ${seleccion.size}`}
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 w-8"></th>
                  <th className="px-4 py-2.5">Nº · Niño/a</th>
                  <th className="px-4 py-2.5">Email tutor</th>
                  <th className="px-4 py-2.5">Programa</th>
                  <th className="px-4 py-2.5">Enviado</th>
                  <th className="px-4 py-2.5">Progreso</th>
                  <th className="px-4 py-2.5">Último recordatorio</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const e = p.expediente
                  const checked = seleccion.has(e.id)
                  const dias = e.formulario_enviado_at
                    ? diasDesde(e.formulario_enviado_at)
                    : null
                  const ultRec = p.ultimoRecordatorioAt
                    ? diasDesde(p.ultimoRecordatorioAt)
                    : null
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUno(e.id)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs font-mono text-slate-500">
                          {e.numero_participante ?? '—'}
                        </div>
                        <div className="font-medium text-slate-900">
                          {`${e.alumno_nombre ?? ''} ${e.alumno_apellidos ?? ''}`.trim() ||
                            '—'}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {e.tutor_email ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {e.programa === 'robotica' ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-800">
                            Robótica
                          </span>
                        ) : e.programa === 'emprendimiento' ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                            Emprendimiento
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700">
                        {dias === null
                          ? '—'
                          : dias === 0
                            ? 'Hoy'
                            : `Hace ${dias} d`}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700">
                        Sección {e.current_section || 1} de {TOTAL_SECCIONES}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700">
                        {ultRec === null
                          ? '—'
                          : ultRec === 0
                            ? `Hoy (${p.recordatoriosCount})`
                            : `Hace ${ultRec} d (${p.recordatoriosCount})`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
