import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/useSession'
import { useStaffStatus } from '../../lib/useStaffStatus'
import {
  enviarFormularioAExpedientes,
  getEdicionActiva,
  listarFormulariosEnviados,
  listarPdfsGenerados,
  listarTodosExpedientes,
  marcarPagado,
  registrarEvento,
  type CampusEdicion,
  type Expediente,
} from '../../features/expediente/api'
import {
  decisionImagenLabel,
  requiereConfirmacionImagen,
} from '../../features/expediente/validacion'
import {
  exportarPdfCocinero,
  exportarPdfLog,
  exportarPdfMedico,
} from '../../features/backoffice/pdfExport'
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

const ESTADOS_FILTRO = ['creado', 'en_progreso', 'enviado'] as const

export function BackofficeList() {
  const navigate = useNavigate()
  const staff = useStaffStatus()
  const session = useSession()
  const staffEmail = session.session?.user.email ?? 'admin'
  const [expedientes, setExpedientes] = useState<Expediente[] | null>(null)
  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [enviandoForm, setEnviandoForm] = useState(false)
  const [enviandoSinPago, setEnviandoSinPago] = useState(false)
  const [marcandoPagado, setMarcandoPagado] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [estadoFiltro, setEstadoFiltro] = useState<string[]>([
    'creado',
    'en_progreso',
    'enviado',
  ])
  const [programaFiltro, setProgramaFiltro] = useState<string[]>([])
  const [tipoFiltro, setTipoFiltro] = useState<string[]>(['estudiante'])
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
      if (tipoFiltro.length > 0 && !tipoFiltro.includes(e.tipo)) return false
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
  }, [expedientes, tipoFiltro, estadoFiltro, programaFiltro, soloPendientesImagen, busqueda])

  const onLogout = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  // Describe la selección actual para el log "pdf_generado".
  const describeSeleccion = () => {
    const tipos = new Set(filtrados.map((e) => e.tipo))
    const programas = new Set(
      filtrados
        .map((e) => e.programa)
        .filter((p): p is NonNullable<typeof p> => p !== null)
    )
    return {
      tipoSel:
        tipos.size === 0
          ? 'ninguno'
          : tipos.size === 1
            ? Array.from(tipos)[0] + 's'
            : 'todos',
      programaSel:
        programas.size === 0
          ? 'sin-programa'
          : programas.size === 1
            ? Array.from(programas)[0]
            : 'todos',
      n: filtrados.length,
    }
  }

  const logPdfGenerado = async (docKind: string) => {
    await registrarEvento(
      null,
      'pdf_generado',
      { doc: docKind, ...describeSeleccion() },
      staffEmail
    )
  }

  const onPdfCocinero = async () => {
    setExportando(true)
    try {
      await exportarPdfCocinero(filtrados, edicion)
      await logPdfGenerado('cocinero')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar PDF')
    } finally {
      setExportando(false)
    }
  }

  const pagadasNoEnviadas = useMemo(
    () =>
      filtrados.filter(
        (e) =>
          e.tipo === 'estudiante' &&
          e.pagado_at &&
          !e.formulario_enviado_at &&
          (e.tutor_email ?? '').trim().length > 0
      ),
    [filtrados]
  )

  const toggleSeleccion = (id: string) => {
    setSeleccion((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Expedientes seleccionados que son estudiantes (las acciones no aplican a
  // staff). Pre-computado para los botones de acción.
  const seleccionEstudiantes = useMemo(
    () =>
      filtrados.filter(
        (e) => seleccion.has(e.id) && e.tipo === 'estudiante'
      ),
    [filtrados, seleccion]
  )

  const seleccionMarcables = useMemo(
    () => seleccionEstudiantes.filter((e) => !e.pagado_at),
    [seleccionEstudiantes]
  )

  const seleccionEnviables = useMemo(
    () =>
      seleccionEstudiantes.filter(
        (e) =>
          !e.formulario_enviado_at && (e.tutor_email ?? '').trim().length > 0
      ),
    [seleccionEstudiantes]
  )

  const onMarcarPagadoSeleccionadas = async () => {
    if (seleccionMarcables.length === 0) return
    setMarcandoPagado(true)
    setError(null)
    setInfo(null)
    const ahora = new Date().toISOString()
    const idsAfectados = seleccionMarcables.map((e) => e.id)
    // Optimistic
    setExpedientes((curr) =>
      curr
        ? curr.map((x) =>
            idsAfectados.includes(x.id)
              ? { ...x, pagado_at: ahora, pagado_por: staffEmail }
              : x
          )
        : curr
    )
    let fallos = 0
    for (const id of idsAfectados) {
      try {
        await marcarPagado(id, true, staffEmail)
      } catch {
        fallos++
      }
    }
    if (fallos > 0) {
      setError(
        `Se marcaron ${idsAfectados.length - fallos} de ${idsAfectados.length}. Fallaron ${fallos}.`
      )
      // En caso de fallo parcial, recargamos para reflejar estado real
    } else {
      setInfo(`Marcados como pagados: ${idsAfectados.length}`)
    }
    setSeleccion(new Set())
    setMarcandoPagado(false)
  }

  const onEnviarSinPago = async () => {
    if (seleccionEnviables.length === 0) return
    setEnviandoSinPago(true)
    setError(null)
    setInfo(null)
    try {
      const redirectTo = `${window.location.origin}/callback`
      const res = await enviarFormularioAExpedientes(
        seleccionEnviables,
        redirectTo,
        staffEmail
      )
      const okIds = new Set(res.filter((r) => r.ok).map((r) => r.expedienteId))
      const ahora = new Date().toISOString()
      setExpedientes((curr) =>
        curr
          ? curr.map((x) =>
              okIds.has(x.id)
                ? {
                    ...x,
                    formulario_enviado_at: ahora,
                    formulario_enviado_por: staffEmail,
                  }
                : x
          )
          : curr
      )
      // Marcamos en log con payload "bypass_pago: true" para distinguir en
      // auditoría de los envíos del flujo estricto.
      for (const id of Array.from(okIds)) {
        registrarEvento(
          id,
          'formulario_enviado',
          { bypass_pago: true, por: staffEmail },
          staffEmail
        ).catch(() => {})
      }
      const ok = res.filter((r) => r.ok).length
      const fallos = res.filter((r) => !r.ok)
      if (fallos.length === 0) {
        setInfo(`Formulario enviado (sin requerir pago) a ${ok} familia(s).`)
      } else {
        setError(
          `Se enviaron ${ok}, fallaron ${fallos.length}: ${fallos
            .map((f) => `${f.email || '(sin email)'} → ${f.error}`)
            .join('; ')}`
        )
      }
      setSeleccion(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setEnviandoSinPago(false)
    }
  }

  const onEnviarFormulario = async () => {
    if (pagadasNoEnviadas.length === 0) return
    setEnviandoForm(true)
    setError(null)
    setInfo(null)
    try {
      const redirectTo = `${window.location.origin}/callback`
      const res = await enviarFormularioAExpedientes(
        pagadasNoEnviadas,
        redirectTo,
        staffEmail
      )
      const okIds = new Set(res.filter((r) => r.ok).map((r) => r.expedienteId))
      const ahora = new Date().toISOString()
      setExpedientes((curr) =>
        curr
          ? curr.map((x) =>
              okIds.has(x.id)
                ? {
                    ...x,
                    formulario_enviado_at: ahora,
                    formulario_enviado_por: staffEmail,
                  }
                : x
            )
          : curr
      )
      const ok = res.filter((r) => r.ok).length
      const fallos = res.filter((r) => !r.ok)
      if (fallos.length === 0) {
        setInfo(`Formulario enviado a ${ok} familia(s).`)
      } else {
        setError(
          `Se enviaron ${ok}, fallaron ${fallos.length}: ${fallos
            .map((f) => `${f.email || '(sin email)'} → ${f.error}`)
            .join('; ')}`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setEnviandoForm(false)
    }
  }

  const onPdfMedico = async () => {
    setExportando(true)
    try {
      await exportarPdfMedico(filtrados, edicion)
      await logPdfGenerado('medico')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar PDF')
    } finally {
      setExportando(false)
    }
  }

  const onPdfLog = async () => {
    setExportando(true)
    try {
      const [formularios, pdfs] = await Promise.all([
        listarFormulariosEnviados(),
        listarPdfsGenerados(),
      ])
      await exportarPdfLog(formularios, pdfs, edicion)
      // No registramos este evento para no meter el log dentro de sí mismo.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar log')
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
            <Link
              to="/admin/staff/nuevo"
              className="text-sm font-medium text-slate-900 hover:underline"
            >
              + Añadir staff
            </Link>
            <Link
              to="/admin/recordatorios"
              className="text-sm font-medium text-slate-900 hover:underline"
            >
              ✉ Recordatorios
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
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onMarcarPagadoSeleccionadas}
              disabled={marcandoPagado || seleccionMarcables.length === 0}
              title={
                seleccionMarcables.length === 0
                  ? 'Selecciona alguna fila aún no pagada para marcarla'
                  : `Marcar como pagado ${seleccionMarcables.length} expediente(s)`
              }
              className="text-sm font-medium rounded-lg bg-emerald-700 text-white px-3 py-1.5 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {marcandoPagado
                ? '…'
                : `✓ Marcar pagado (${seleccionMarcables.length})`}
            </button>
            <button
              type="button"
              onClick={onEnviarFormulario}
              disabled={enviandoForm || pagadasNoEnviadas.length === 0}
              title={
                pagadasNoEnviadas.length === 0
                  ? 'Marca como "Pagado" alguna familia que aún no haya recibido el formulario'
                  : `Enviar el magic link a ${pagadasNoEnviadas.length} familia(s) pagada(s) y aún no contactada(s)`
              }
              className="text-sm font-medium rounded-lg bg-blue-700 text-white px-3 py-1.5 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviandoForm
                ? '…'
                : `↗ Enviar formulario (${pagadasNoEnviadas.length})`}
            </button>
            <button
              type="button"
              onClick={onEnviarSinPago}
              disabled={enviandoSinPago || seleccionEnviables.length === 0}
              title={
                seleccionEnviables.length === 0
                  ? 'Selecciona expedientes aún no enviados para mandarles el formulario sin requerir pago previo'
                  : `Enviar formulario a ${seleccionEnviables.length} familia(s) seleccionada(s) — sin requerir pago`
              }
              className="text-sm font-medium rounded-lg bg-white text-slate-700 border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviandoSinPago
                ? '…'
                : `↗ Enviar sin pago (${seleccionEnviables.length})`}
            </button>
            <button
              type="button"
              onClick={onPdfCocinero}
              disabled={exportando || filtrados.length === 0}
              className="text-sm font-medium rounded-lg bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportando ? '…' : '↓ Cocinero (PDF)'}
            </button>
            <button
              type="button"
              onClick={onPdfMedico}
              disabled={exportando || filtrados.length === 0}
              className="text-sm font-medium rounded-lg bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportando ? '…' : '↓ Médico (PDF)'}
            </button>
            <button
              type="button"
              onClick={onPdfLog}
              disabled={exportando}
              title="Histórico completo de envíos de formulario y generaciones de PDF"
              className="text-sm font-medium rounded-lg bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportando ? '…' : '↓ Log (PDF)'}
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
                Tipo
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { v: 'estudiante', label: 'Estudiantes' },
                    { v: 'staff', label: 'Staff' },
                  ] as const
                ).map((t) => {
                  const activo = tipoFiltro.includes(t.v)
                  return (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() =>
                        setTipoFiltro((cur) =>
                          activo
                            ? cur.filter((s) => s !== t.v)
                            : [...cur, t.v]
                        )
                      }
                      className={`text-xs px-2.5 py-1 rounded-full border ${
                        activo
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
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
              tipoFiltro.length > 0 ||
              soloPendientesImagen ||
              busqueda) && (
              <button
                type="button"
                onClick={() => {
                  setEstadoFiltro([])
                  setProgramaFiltro([])
                  setTipoFiltro([])
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
        {info && (
          <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm p-3">
            {info}
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
                  <th className="px-4 py-2.5">Pagado</th>
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
                    <td className="px-4 py-3 align-top">
                      {e.tipo === 'staff' ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="space-y-1">
                          {/* Checkbox de SELECCIÓN. Sigue activo aunque la fila
                              ya esté pagada/enviada — para coherencia visual,
                              aunque los botones de acción la ignoren. */}
                          <input
                            type="checkbox"
                            aria-label="Seleccionar"
                            checked={seleccion.has(e.id)}
                            onChange={() => toggleSeleccion(e.id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {/* Badges de estado, no interactivos */}
                          {e.pagado_at && (
                            <div className="text-[10px] font-medium text-emerald-700">
                              ✓ Pagado{' '}
                              {new Date(e.pagado_at).toLocaleDateString(
                                'es-ES',
                                { day: '2-digit', month: '2-digit' }
                              )}
                            </div>
                          )}
                          {e.formulario_enviado_at && (
                            <div className="text-[10px] font-medium text-blue-700">
                              Form enviado{' '}
                              {new Date(
                                e.formulario_enviado_at
                              ).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </div>
                          )}
                          {!e.pagado_at &&
                            (e.tutor_email ?? '').trim().length === 0 && (
                              <div className="text-[10px] font-medium text-red-700">
                                ⚠ Sin email de tutor
                              </div>
                            )}
                        </div>
                      )}
                    </td>
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
                        {e.modificado_postenvio_at && (
                          <span
                            title={`La familia modificó el formulario tras enviarlo el ${new Date(e.modificado_postenvio_at).toLocaleString('es-ES')}`}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300"
                          >
                            ✎ Modificado{' '}
                            {new Date(
                              e.modificado_postenvio_at
                            ).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: '2-digit',
                            })}
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
