import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useClientaStatus } from '../../lib/useClientaStatus'
import {
  borrarExpedienteVacio,
  getEdicionActiva,
  listarExpedientesPorEdicion,
  type CampusEdicion,
  type Expediente,
} from '../../features/expediente/api'
import { PageSpinner } from '../../components/ui/PageSpinner'

export function ClientaDashboard() {
  const clienta = useClientaStatus()
  const navigate = useNavigate()
  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [expedientes, setExpedientes] = useState<Expediente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)

  useEffect(() => {
    if (clienta.status !== 'clienta') return
    ;(async () => {
      try {
        const ed = await getEdicionActiva()
        setEdicion(ed)
        if (ed) {
          const lista = await listarExpedientesPorEdicion(ed.id)
          setExpedientes(lista)
        } else {
          setExpedientes([])
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar')
      }
    })()
  }, [clienta.status])

  if (clienta.status === 'loading') return <PageSpinner />
  if (clienta.status === 'not_clienta') return <Navigate to="/" replace />

  const onLogout = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const onBorrar = async (e: Expediente) => {
    const nombre = `${e.alumno_nombre ?? ''} ${e.alumno_apellidos ?? ''}`.trim() || 'sin nombre'
    if (!confirm(`¿Borrar el expediente de ${nombre}? Solo se puede si la familia aún no lo ha enviado.`))
      return
    setBorrando(e.id)
    setError(null)
    try {
      await borrarExpedienteVacio(e.id)
      setExpedientes((cur) => cur?.filter((x) => x.id !== e.id) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-900">
              Campus FRP · Panel de la clienta
            </span>
            {edicion && (
              <span className="text-xs text-slate-500">{edicion.nombre}</span>
            )}
          </div>
          <button
            onClick={onLogout}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Niños inscritos</h1>
          <p className="text-slate-600 text-sm mt-1">
            Carga aquí los niños inscritos con sus datos básicos.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">
            {error}
          </div>
        )}

        {/* Acciones grandes */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Link
            to="/clienta/nuevo"
            className="block rounded-2xl border border-slate-200 bg-white p-6 hover:border-slate-400 transition-colors"
          >
            <div className="text-3xl">＋</div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              Añadir un niño/a
            </div>
            <div className="text-sm text-slate-600 mt-1">
              Cargar uno a uno con un formulario.
            </div>
          </Link>
          <Link
            to="/clienta/importar"
            className="block rounded-2xl border border-slate-200 bg-white p-6 hover:border-slate-400 transition-colors"
          >
            <div className="text-3xl">↑</div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              Subir Excel
            </div>
            <div className="text-sm text-slate-600 mt-1">
              Cargar varios a la vez desde una hoja de cálculo.
            </div>
          </Link>
        </div>

        {/* Listado */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Tu lista{' '}
              <span className="text-slate-500 font-normal">
                ({expedientes?.length ?? 0})
              </span>
            </h2>
          </div>
          {expedientes === null ? (
            <div className="p-6 text-slate-500 text-sm">Cargando…</div>
          ) : expedientes.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-sm">
              Aún no has añadido ningún niño/a. Usa los botones de arriba para
              empezar.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Nº</th>
                  <th className="px-4 py-2.5">Alumno/a</th>
                  <th className="px-4 py-2.5">Programa</th>
                  <th className="px-4 py-2.5">Email tutor</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {expedientes.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-500">
                      {e.numero_participante ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {e.alumno_nombre || e.alumno_apellidos
                        ? `${e.alumno_nombre ?? ''} ${e.alumno_apellidos ?? ''}`.trim()
                        : '—'}
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
                    <td className="px-4 py-2.5 text-slate-700 text-xs">
                      {e.tutor_email ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!e.submitted_at && (
                        <button
                          type="button"
                          onClick={() => onBorrar(e)}
                          disabled={borrando === e.id}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          {borrando === e.id ? '…' : 'Borrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
