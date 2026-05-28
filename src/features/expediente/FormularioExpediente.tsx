import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  actualizarExpediente,
  getEdicionActiva,
  getExpediente,
  registrarEvento,
  type CampusEdicion,
  type EstadoExpediente,
  type Expediente,
} from './api'

const ESTADOS_TRAS_ENVIO: EstadoExpediente[] = ['enviado', 'validado']

function esModificacionPostEnvio(e: Expediente): boolean {
  return !!e.submitted_at && ESTADOS_TRAS_ENVIO.includes(e.estado)
}
import { BarraProgreso } from '../../components/ui/BarraProgreso'
import { SECCIONES, TOTAL_SECCIONES } from './secciones'
import { Seccion1Datos } from './Seccion1Datos'
import { Seccion2Familia } from './Seccion2Familia'
import { Seccion3Salud } from './Seccion3Salud'
import { Seccion4Medicacion } from './Seccion4Medicacion'
import { Seccion5Conociendote } from './Seccion5Conociendote'
import { Seccion6Autorizaciones } from './Seccion6Autorizaciones'
import { Seccion7Revision } from './Seccion7Revision'
import { ExpedienteEnviadoView } from './ExpedienteEnviadoView'
import { useSession } from '../../lib/useSession'

type Props = {
  /** Si true, salta el bloqueo por estado enviado y cambia los enlaces de
   *  navegación para volver al detalle del backoffice. Solo usado en la
   *  ruta /admin/expediente/:id/editar. */
  modoAdmin?: boolean
}

export function FormularioExpediente({ modoAdmin = false }: Props = {}) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const session = useSession()
  const [expediente, setExpediente] = useState<Expediente | null>(null)
  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const authEmail =
    session.status === 'authenticated' ? session.session.user.email ?? null : null
  const volverHref = modoAdmin
    ? `/admin/expediente/${id ?? ''}`
    : '/mis-expedientes'
  const volverLabel = modoAdmin ? '← Volver al detalle' : '← Mis expedientes'

  useEffect(() => {
    if (!id) return
    Promise.all([getExpediente(id), getEdicionActiva()])
      .then(([exp, ed]) => {
        setExpediente(exp)
        setEdicion(ed)
      })
      .catch((e) => setError(e.message))
  }, [id])

  if (error) {
    return (
      <Centered>
        <div className="bg-white rounded-2xl shadow-sm p-6 max-w-md w-full text-center">
          <p className="text-red-700 text-sm">{error}</p>
          <Link
            to="/mis-expedientes"
            className="inline-block mt-4 text-slate-900 underline text-sm"
          >
            Volver
          </Link>
        </div>
      </Centered>
    )
  }

  if (!expediente) {
    return (
      <Centered>
        <div className="text-slate-500 text-sm">Cargando…</div>
      </Centered>
    )
  }

  const seccion = expediente.current_section || 1

  const guardar = async (patch: {
    columnas: Partial<Expediente>
    respuestas: Record<string, unknown>
  }) => {
    if (!expediente) return
    const nuevasRespuestas = {
      ...(expediente.respuestas ?? {}),
      [`seccion${seccion}`]: {
        ...((expediente.respuestas?.[`seccion${seccion}`] as object | undefined) ?? {}),
        ...patch.respuestas,
      },
    }
    // Si el formulario ya estaba enviado y la familia (no el admin) edita,
    // bumpamos `modificado_postenvio_at` para que el admin lo vea y para
    // que la Sección 7 detecte qué firmas quedaron stale.
    const esPostenvio = !modoAdmin && esModificacionPostEnvio(expediente)
    const primeraEdicionPostenvio =
      esPostenvio && !expediente.modificado_postenvio_at
    const merged: Partial<Expediente> = {
      ...patch.columnas,
      respuestas: nuevasRespuestas,
      ...(esPostenvio
        ? { modificado_postenvio_at: new Date().toISOString() }
        : {}),
    }
    await actualizarExpediente(expediente.id, merged)
    if (primeraEdicionPostenvio) {
      // Solo registramos el evento la primera vez de cada "ola" de edición,
      // no en cada autosave (sería ruidoso). Cuando admin/familia "limpian"
      // el flag (p.ej. tras re-firmar), un nuevo edit volverá a dispararlo.
      registrarEvento(
        expediente.id,
        'expediente_modificado_postenvio',
        { seccion_inicial: seccion },
        'familia'
      ).catch(() => {})
    }
    setExpediente({ ...expediente, ...merged, respuestas: nuevasRespuestas })
  }

  const cambiarFoto = async (path: string | null) => {
    if (!expediente) return
    await actualizarExpediente(expediente.id, { foto_path: path })
    setExpediente({ ...expediente, foto_path: path })
  }

  const irSeccion = async (n: number) => {
    if (!expediente) return
    const clamped = Math.max(1, Math.min(TOTAL_SECCIONES, n))
    if (clamped === seccion) return
    await actualizarExpediente(expediente.id, { current_section: clamped })
    setExpediente({ ...expediente, current_section: clamped })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await registrarEvento(expediente.id, 'navegacion_seccion', {
      desde: seccion,
      hacia: clamped,
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Link
              to={volverHref}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              {volverLabel}
            </Link>
            <div className="flex items-center gap-2">
              {modoAdmin && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  Modo edición admin
                </span>
              )}
              {edicion && (
                <span className="text-xs text-slate-500 truncate">
                  {edicion.nombre}
                </span>
              )}
            </div>
          </div>
          <BarraProgreso seccion={seccion} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {!modoAdmin &&
          esModificacionPostEnvio(expediente) &&
          expediente.modificado_postenvio_at && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 mb-4">
              ✎ Estás modificando un formulario que ya enviaste. Los cambios se
              guardan automáticamente. Si la modificación afecta a una firma,
              tendrás que volver a firmarla en la Sección 7 para confirmar.
            </div>
          )}
        {seccion === 1 && (
          <Seccion1Datos
            expediente={expediente}
            edicion={edicion}
            onSave={guardar}
            onFotoChange={cambiarFoto}
            onNext={() => irSeccion(2)}
          />
        )}
        {seccion === 2 && (
          <Seccion2Familia
            expediente={expediente}
            edicion={edicion}
            authEmail={authEmail}
            onSave={guardar}
            onPrev={() => irSeccion(1)}
            onNext={() => irSeccion(3)}
          />
        )}
        {seccion === 3 && (
          <Seccion3Salud
            expediente={expediente}
            edicion={edicion}
            onSave={guardar}
            onPrev={() => irSeccion(2)}
            onNext={() => irSeccion(4)}
          />
        )}
        {seccion === 4 && (
          <Seccion4Medicacion
            expediente={expediente}
            edicion={edicion}
            onSave={guardar}
            onPrev={() => irSeccion(3)}
            onNext={() => irSeccion(5)}
          />
        )}
        {seccion === 5 && (
          <Seccion5Conociendote
            expediente={expediente}
            edicion={edicion}
            onSave={guardar}
            onPrev={() => irSeccion(4)}
            onNext={() => irSeccion(6)}
          />
        )}
        {seccion === 6 && (
          <Seccion6Autorizaciones
            expediente={expediente}
            edicion={edicion}
            onSave={guardar}
            onPrev={() => irSeccion(5)}
            onNext={() => irSeccion(7)}
          />
        )}
        {/* En Sección 7 mostramos:
         *  - La vista "Enviado" SOLO si está enviado/validado/cerrado Y no
         *    hay modificaciones tras envío pendientes de confirmar (admin
         *    siempre ve el form).
         *  - El componente Revisión en cualquier otro caso (incluye el
         *    flujo postenvío con re-firma). */}
        {seccion === 7 &&
          !modoAdmin &&
          estaEnviado(expediente) &&
          !expediente.modificado_postenvio_at && (
            <ExpedienteEnviadoView
              expediente={expediente}
              onModificar={() => irSeccion(1)}
            />
          )}
        {seccion === 7 &&
          (modoAdmin ||
            !estaEnviado(expediente) ||
            !!expediente.modificado_postenvio_at) && (
            <Seccion7Revision
              expediente={expediente}
              onPrev={() => irSeccion(6)}
              onEnviado={async () => {
                const updated = await getExpediente(expediente.id)
                setExpediente(updated)
                if (modoAdmin) navigate(volverHref)
              }}
            />
          )}
        <p className="text-center text-xs text-slate-400 mt-6">
          {SECCIONES.length} secciones · Guardado automático · Puedes cerrar y
          volver más tarde
        </p>
        <button
          type="button"
          onClick={() => navigate(volverHref)}
          className="block mx-auto mt-3 text-xs text-slate-500 hover:text-slate-700"
        >
          {modoAdmin ? 'Volver al detalle' : 'Salir y continuar más tarde'}
        </button>
      </main>
    </div>
  )
}

function estaEnviado(exp: Expediente): boolean {
  // 'requiere_correccion' permite a la familia editar de nuevo
  return ['enviado', 'validado', 'cerrado'].includes(exp.estado)
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {children}
    </div>
  )
}
