import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  actualizarExpediente,
  getEdicionActiva,
  getExpediente,
  registrarEvento,
  type CampusEdicion,
  type Expediente,
} from './api'
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

export function FormularioExpediente() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const session = useSession()
  const [expediente, setExpediente] = useState<Expediente | null>(null)
  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const authEmail =
    session.status === 'authenticated' ? session.session.user.email ?? null : null

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
    const merged: Partial<Expediente> = {
      ...patch.columnas,
      respuestas: nuevasRespuestas,
    }
    await actualizarExpediente(expediente.id, merged)
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
              to="/mis-expedientes"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Mis expedientes
            </Link>
            {edicion && (
              <span className="text-xs text-slate-500 truncate">
                {edicion.nombre}
              </span>
            )}
          </div>
          <BarraProgreso seccion={seccion} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
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
        {seccion === 7 && estaEnviado(expediente) && (
          <ExpedienteEnviadoView expediente={expediente} />
        )}
        {seccion === 7 && !estaEnviado(expediente) && (
          <Seccion7Revision
            expediente={expediente}
            onPrev={() => irSeccion(6)}
            onGoToSeccion={irSeccion}
            onEnviado={async () => {
              const updated = await getExpediente(expediente.id)
              setExpediente(updated)
            }}
          />
        )}
        <p className="text-center text-xs text-slate-400 mt-6">
          {SECCIONES.length} secciones · Guardado automático · Puedes cerrar y
          volver más tarde
        </p>
        <button
          type="button"
          onClick={() => navigate('/mis-expedientes')}
          className="block mx-auto mt-3 text-xs text-slate-500 hover:text-slate-700"
        >
          Salir y continuar más tarde
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
