import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/useSession'
import { useStaffStatus } from '../../lib/useStaffStatus'
import { useClientaStatus } from '../../lib/useClientaStatus'
import {
  listarExpedientes,
  type Expediente,
} from '../../features/expediente/api'
import { reclamarInvitaciones } from '../../features/backoffice/invitacionesImport'

// Defensa contra doble llamada por StrictMode / remontaje rápido.
const reclamadoEnSesion = new Set<string>()

const estadoLabel: Record<string, string> = {
  creado: 'Sin empezar',
  en_progreso: 'En progreso',
  pendiente_de_firma: 'Falta firma',
  enviado: 'Enviado ✓',
  validado: 'Validado ✓',
  requiere_correccion: 'Necesita corrección',
  cerrado: 'Cerrado',
}

const estadoColor: Record<string, string> = {
  creado: 'bg-slate-100 text-slate-700',
  en_progreso: 'bg-blue-100 text-blue-800',
  pendiente_de_firma: 'bg-amber-100 text-amber-800',
  enviado: 'bg-emerald-100 text-emerald-800',
  validado: 'bg-emerald-100 text-emerald-800',
  requiere_correccion: 'bg-red-100 text-red-800',
  cerrado: 'bg-slate-200 text-slate-600',
}

export function MisExpedientes() {
  const session = useSession()
  const staff = useStaffStatus()
  const clienta = useClientaStatus()
  const navigate = useNavigate()
  const [expedientes, setExpedientes] = useState<Expediente[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const yaRedirigidoRef = useRef(false)

  useEffect(() => {
    if (session.status !== 'authenticated') return
    const userId = session.session.user.id
    let cancelado = false
    ;(async () => {
      try {
        let reclamados: string[] = []
        if (!reclamadoEnSesion.has(userId)) {
          reclamadoEnSesion.add(userId)
          reclamados = await reclamarInvitaciones()
        }
        const lista = await listarExpedientes(userId)
        if (cancelado) return
        setExpedientes(lista)
        if (
          !yaRedirigidoRef.current &&
          reclamados.length === 1 &&
          lista.length === 1
        ) {
          yaRedirigidoRef.current = true
          navigate(`/expediente/${reclamados[0]}`, { replace: true })
        }
      } catch (e) {
        if (!cancelado)
          setError(e instanceof Error ? e.message : 'Error al cargar')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [session, navigate])

  const onLogout = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  if (session.status !== 'authenticated') return null

  if (staff.status === 'staff') return <Navigate to="/admin" replace />
  if (clienta.status === 'clienta') return <Navigate to="/clienta" replace />

  const numHijos = expedientes?.length ?? 0
  const esPlural = numHijos > 1

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 to-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="text-sm text-slate-600 truncate">
            {session.session.user.email}
          </div>
          <button
            onClick={onLogout}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Hero / Bienvenida */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900 mb-3">
            Bienvenidos al Campus FRP
          </h1>
          <p className="text-slate-700 leading-relaxed">
            Nos alegra muchísimo teneros aquí. Desde el equipo del Campus
            queremos preparar la mejor experiencia posible para vuestro/s
            hijo/a, y para eso necesitamos que rellenéis un formulario con
            información sobre ellos: datos básicos, salud, alergias,
            autorizaciones y firmas.
          </p>
          <p className="text-slate-700 leading-relaxed mt-3">
            Tardaréis entre <strong>20 y 30 minutos</strong>. El formulario se
            va guardando automáticamente — podéis dejarlo a medias y continuar
            en otro momento sin perder nada de lo escrito.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3 mb-4">
            {error}
          </div>
        )}

        {/* Lista de expedientes */}
        {expedientes === null ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500">
            Cargando…
          </div>
        ) : expedientes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-slate-700">
              Todavía no tenemos ningún expediente asociado a este correo.
            </p>
            <p className="text-slate-500 text-sm mt-2">
              Si esperabais ver el formulario de vuestro hijo/a aquí, por favor
              avisad al equipo del Campus respondiendo al correo que recibisteis.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-base font-semibold text-slate-900 mb-3 px-1">
              {esPlural
                ? `Vuestros ${numHijos} hijos/as inscritos:`
                : 'Vuestro/a hijo/a inscrito/a:'}
            </h2>
            <ul className="space-y-3 mb-6">
              {expedientes.map((exp) => {
                const nombre =
                  exp.alumno_nombre || exp.alumno_apellidos
                    ? `${exp.alumno_nombre ?? ''} ${exp.alumno_apellidos ?? ''}`.trim()
                    : 'Expediente sin nombre'
                const seccionActual = exp.current_section ?? 1
                const seccionMax = 7
                const enviado = !!exp.submitted_at
                return (
                  <li key={exp.id}>
                    <Link
                      to={`/expediente/${exp.id}`}
                      className="block bg-white rounded-xl border border-slate-200 p-5 hover:border-emerald-400 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-semibold text-slate-900 text-base">
                              {nombre}
                            </div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                estadoColor[exp.estado] ??
                                'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {estadoLabel[exp.estado] ?? exp.estado}
                            </span>
                          </div>
                          {!enviado && (
                            <div className="text-xs text-slate-500 mt-1">
                              Vais por la sección {seccionActual} de {seccionMax}
                            </div>
                          )}
                          {enviado && (
                            <div className="text-xs text-emerald-700 mt-1">
                              Formulario enviado — gracias
                            </div>
                          )}
                        </div>
                        <div className="text-slate-400 text-xl">›</div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {/* Caja de ayuda */}
        {expedientes && expedientes.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-900">
            <h3 className="font-semibold mb-2">Antes de empezar</h3>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>
                Tened a mano una <strong>foto reciente</strong> de vuestro
                hijo/a (clara, fondo neutro, menos de 10 MB).
              </li>
              <li>
                Si tiene <strong>alergias</strong> o toma{' '}
                <strong>medicación</strong>, tened cerca la información médica.
              </li>
              <li>
                Si toma medicación durante el Campus o tenéis certificado de
                vacunación, podéis adjuntar fotos o PDFs (hasta 10 MB cada uno).
              </li>
              <li>
                Al final del formulario tendréis que <strong>firmar</strong>{' '}
                con el dedo (móvil/tableta) o con el ratón. Os llevará un
                minuto.
              </li>
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 mt-8">
          <p>Si tenéis cualquier duda mientras rellenáis el formulario,</p>
          <p>
            contestad al correo del Campus o escribidnos directamente. Estamos
            para ayudaros.
          </p>
          <p className="mt-3 text-slate-400">— Equipo del Campus FRP</p>
        </div>
      </main>
    </div>
  )
}
