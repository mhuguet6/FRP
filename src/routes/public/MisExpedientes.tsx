import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/useSession'
import { useStaffStatus } from '../../lib/useStaffStatus'
import {
  crearExpediente,
  listarExpedientes,
  registrarEvento,
  type Expediente,
} from '../../features/expediente/api'
import { reclamarInvitaciones } from '../../features/backoffice/invitacionesImport'

// Defensa contra doble llamada por StrictMode / remontaje rápido.
// Si ya hemos intentado reclamar para este user en esta sesión del SPA,
// no lo volvemos a hacer (la BD también está protegida con FOR UPDATE
// SKIP LOCKED, esto es defensa en profundidad).
const reclamadoEnSesion = new Set<string>()

const estadoLabel: Record<string, string> = {
  creado: 'Sin empezar',
  en_progreso: 'En progreso',
  pendiente_de_firma: 'Falta firma',
  enviado: 'Enviado',
  validado: 'Validado',
  requiere_correccion: 'Necesita corrección',
  cerrado: 'Cerrado',
}

export function MisExpedientes() {
  const session = useSession()
  const staff = useStaffStatus()
  const navigate = useNavigate()
  const [expedientes, setExpedientes] = useState<Expediente[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)


  const yaRedirigidoRef = useRef(false)

  useEffect(() => {
    if (session.status !== 'authenticated') return
    const userId = session.session.user.id
    let cancelado = false
    ;(async () => {
      try {
        // 1. Reclamar invitaciones pendientes (auto-crea expedientes) — solo
        //    si no se ha hecho ya en esta sesión del SPA.
        let reclamados: string[] = []
        if (!reclamadoEnSesion.has(userId)) {
          reclamadoEnSesion.add(userId)
          reclamados = await reclamarInvitaciones()
        }

        // 2. Cargar la lista completa
        const lista = await listarExpedientes(userId)
        if (cancelado) return
        setExpedientes(lista)

        // 3. Si la familia es nueva (acaba de reclamar 1 invitación y solo
        //    tiene 1 expediente), redirigimos directo al formulario para
        //    ahorrar el clic.
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

  const onCrear = async () => {
    if (session.status !== 'authenticated') return
    setCreating(true)
    setError(null)
    try {
      const nuevo = await crearExpediente(session.session.user.id)
      await registrarEvento(nuevo.id, 'expediente_creado')
      navigate(`/expediente/${nuevo.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear expediente')
      setCreating(false)
    }
  }

  const onLogout = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  if (session.status !== 'authenticated') return null

  // Los admins NO ven esta página. Redirección inmediata y sin parpadeo.
  if (staff.status === 'staff') return <Navigate to="/admin" replace />

  return (
    <div className="min-h-screen bg-slate-50">
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

      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">
          Tus expedientes
        </h1>
        <p className="text-slate-600 text-sm mb-6">
          Si tienes más de un hijo/a, crea un expediente para cada uno.
        </p>

        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3 mb-4">
            {error}
          </div>
        )}

        {expedientes === null ? (
          <div className="text-slate-500 text-sm">Cargando…</div>
        ) : expedientes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-slate-600 text-sm">
              Aún no has empezado ningún expediente.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {expedientes.map((exp) => (
              <li key={exp.id}>
                <Link
                  to={`/expediente/${exp.id}`}
                  className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-400 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {exp.alumno_nombre || exp.alumno_apellidos
                          ? `${exp.alumno_nombre ?? ''} ${exp.alumno_apellidos ?? ''}`.trim()
                          : 'Expediente sin nombre'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {estadoLabel[exp.estado] ?? exp.estado}
                      </div>
                    </div>
                    <div className="text-slate-400">›</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={onCrear}
          disabled={creating}
          className="mt-6 w-full rounded-lg bg-slate-900 text-white font-medium py-2.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {creating ? 'Creando…' : '+ Empezar nuevo expediente'}
        </button>
      </main>
    </div>
  )
}
