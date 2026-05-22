import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useStaffStatus } from '../../lib/useStaffStatus'
import {
  getEdicionActiva,
  listarTodosExpedientes,
  type CampusEdicion,
  type Expediente,
} from '../../features/expediente/api'
import { exportarExcel } from '../../features/backoffice/excelExport'
import {
  decisionImagenLabel,
  requiereConfirmacionImagen,
} from '../../features/expediente/validacion'
import {
  exportarDocxCocinero,
  exportarDocxSanitario,
  exportarDocxStaff,
} from '../../features/backoffice/docxExport'
import { PageSpinner } from '../../components/ui/PageSpinner'

const estadoLabel: Record<string, string> = {
  creado: 'Sin empezar',
  en_progreso: 'En progreso',
  pendiente_de_firma: 'Falta firma',
  enviado: 'Enviado',
  validado: 'Validado',
  requiere_correccion: 'Necesita corrección',
  cerrado: 'Cerrado',
}

const estadoColor: Record<string, string> = {
  creado: 'bg-slate-100 text-slate-700',
  en_progreso: 'bg-blue-50 text-blue-700',
  pendiente_de_firma: 'bg-amber-50 text-amber-800',
  enviado: 'bg-emerald-50 text-emerald-800',
  validado: 'bg-emerald-100 text-emerald-900',
  requiere_correccion: 'bg-red-50 text-red-700',
  cerrado: 'bg-slate-200 text-slate-700',
}

const ESTADOS_FILTRO = [
  'enviado',
  'en_progreso',
  'creado',
  'validado',
  'requiere_correccion',
] as const

export function BackofficeList() {
  const navigate = useNavigate()
  const staff = useStaffStatus()
  const [expedientes, setExpedientes] = useState<Expediente[] | null>(null)
  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [estadoFiltro, setEstadoFiltro] = useState<string[]>([
    'enviado',
    'en_progreso',
  ])
  const [programaFiltro, setProgramaFiltro] = useState<string[]>([])
  const [soloPendientesImagen, setSoloPendientesImagen] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (staff.status !== 'staff') return
    Promise.all([listarTodosExpedientes(), getEdicionActiva()])
      .then(([exps, ed]) => {
        setExpedientes(exps)
        setEdicion(ed)
      })
      .catch((e) => setError(e.message))
  }, [staff.status])

  const filtrados = useMemo(() => {
    if (!expedientes) return []
    return expedientes.filter((e) => {
      if (estadoFiltro.length > 0 && !estadoFiltro.includes(e.estado))
        return false
      if (programaFiltro.length > 0) {
        const p = e.programa ?? 'sin_programa'
        if (!programaFiltro.includes(p)) return false
      }
      if (soloPendientesImagen && !requiereConfirmacionImagen(e)) return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const nombre = `${e.alumno_nombre ?? ''} ${e.alumno_apellidos ?? ''}`.toLowerCase()
        const tutor = (e.tutor_nombre ?? '').toLowerCase()
        const email = (e.tutor_email ?? '').toLowerCase()
        if (!nombre.includes(q) && !tutor.includes(q) && !email.includes(q))
          return false
      }
      return true
    })
  }, [expedientes, estadoFiltro, programaFiltro, soloPendientesImagen, busqueda])

  const onLogout = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const onExportar = async () => {
    setExportando(true)
    try {
      await exportarExcel(filtrados, edicion, edicion?.nombre ?? 'expedientes')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar')
    } finally {
      setExportando(false)
    }
  }

  const onDocxCocinero = async () => {
    setExportando(true)
    try {
      await exportarDocxCocinero(filtrados, edicion)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar .docx')
    } finally {
      setExportando(false)
    }
  }

  const onDocxStaff = async () => {
    setExportando(true)
    try {
      await exportarDocxStaff(filtrados, edicion)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar .docx')
    } finally {
      setExportando(false)
    }
  }

  const onDocxSanitario = async () => {
    setExportando(true)
    try {
      await exportarDocxSanitario(filtrados, edicion)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar .docx')
    } finally {
      setExportando(false)
    }
  }

  if (staff.status === 'loading') return <PageSpinner />
  if (staff.status === 'not_staff') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 max-w-md w-full text-center">
          <p className="text-red-700 text-sm">No tienes acceso al backoffice.</p>
          <Link
            to="/mis-expedientes"
            className="inline-block mt-4 text-slate-900 underline text-sm"
          >
            Volver
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-900">
              Backoffice FRP
            </span>
            <span className="text-xs text-slate-500">
              {staff.status === 'staff' ? `(${staff.rol})` : ''}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/admin/invitaciones"
              className="text-sm font-medium text-slate-900 hover:underline"
            >
              + Invitar familias
            </Link>
            <button
              onClick={onLogout}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-slate-900">
            Expedientes ({filtrados.length})
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportar}
              disabled={exportando || filtrados.length === 0}
              className="text-sm font-medium rounded-lg bg-emerald-700 text-white px-3 py-1.5 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportando ? '…' : '↓ Excel'}
            </button>
            <button
              type="button"
              onClick={onDocxCocinero}
              disabled={exportando || filtrados.length === 0}
              className="text-sm font-medium rounded-lg bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportando ? '…' : '↓ Cocinero (.docx)'}
            </button>
            <button
              type="button"
              onClick={onDocxStaff}
              disabled={exportando || filtrados.length === 0}
              className="text-sm font-medium rounded-lg bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportando ? '…' : '↓ Staff (.docx)'}
            </button>
            <button
              type="button"
              onClick={onDocxSanitario}
              disabled={exportando || filtrados.length === 0}
              className="text-sm font-medium rounded-lg bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportando ? '…' : '↓ Sanitario (.docx)'}
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre del participante, tutor o email…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <div className="space-y-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Estado
              </div>
              <div className="flex flex-wrap gap-2">
                {ESTADOS_FILTRO.map((estado) => {
                  const activo = estadoFiltro.includes(estado)
                  return (
                    <button
                      key={estado}
                      type="button"
                      onClick={() =>
                        setEstadoFiltro((cur) =>
                          activo
                            ? cur.filter((s) => s !== estado)
                            : [...cur, estado]
                        )
                      }
                      className={`text-xs px-2.5 py-1 rounded-full border ${
                        activo
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {estadoLabel[estado] ?? estado}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Programa
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { v: 'robotica', label: 'Robótica' },
                    { v: 'emprendimiento', label: 'Emprendimiento' },
                    { v: 'sin_programa', label: 'Sin programa' },
                  ] as const
                ).map((p) => {
                  const activo = programaFiltro.includes(p.v)
                  return (
                    <button
                      key={p.v}
                      type="button"
                      onClick={() =>
                        setProgramaFiltro((cur) =>
                          activo
                            ? cur.filter((s) => s !== p.v)
                            : [...cur, p.v]
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
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Avisos
              </div>
              <button
                type="button"
                onClick={() => setSoloPendientesImagen((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  soloPendientesImagen
                    ? 'bg-amber-700 text-white border-amber-700'
                    : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-50'
                }`}
              >
                ⚠ Pendiente confirmación imagen
              </button>
            </div>
            {(estadoFiltro.length > 0 ||
              programaFiltro.length > 0 ||
              soloPendientesImagen ||
              busqueda) && (
              <button
                type="button"
                onClick={() => {
                  setEstadoFiltro([])
                  setProgramaFiltro([])
                  setSoloPendientesImagen(false)
                  setBusqueda('')
                }}
                className="text-xs text-slate-600 underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
            {error}
          </div>
        )}

        {expedientes === null ? (
          <div className="text-slate-500 text-sm">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-600 text-sm">
            No hay expedientes que coincidan con los filtros.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Programa</th>
                  <th className="px-4 py-2.5">Participante</th>
                  <th className="px-4 py-2.5">Tutor/a</th>
                  <th className="px-4 py-2.5">Actualizado</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          estadoColor[e.estado] ?? 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {estadoLabel[e.estado] ?? e.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>
                          {e.alumno_nombre || e.alumno_apellidos
                            ? `${e.alumno_nombre ?? ''} ${e.alumno_apellidos ?? ''}`.trim()
                            : '—'}
                        </span>
                        {requiereConfirmacionImagen(e) && (
                          <span
                            title={decisionImagenLabel(e) ?? ''}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300"
                          >
                            ⚠ Imagen
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">
                        {e.tutor_nombre ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {e.tutor_email ?? ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 text-xs whitespace-nowrap">
                      {new Date(e.updated_at).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/expediente/${e.id}`}
                        className="text-xs text-slate-900 underline whitespace-nowrap"
                      >
                        Ver detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
