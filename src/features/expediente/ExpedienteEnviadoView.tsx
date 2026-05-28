import { Link } from 'react-router-dom'
import type { Expediente } from './api'

type Props = {
  expediente: Expediente
  onModificar?: () => void
}

export function ExpedienteEnviadoView({ expediente, onModificar }: Props) {
  const fecha = expediente.submitted_at
    ? new Date(expediente.submitted_at).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const nombreParticipante = `${expediente.alumno_nombre ?? ''} ${
    expediente.alumno_apellidos ?? ''
  }`.trim()

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-200 p-8 space-y-6 text-center shadow-sm">
      <div className="text-6xl">🎉</div>

      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          ¡Perfecto! Ya tenemos toda la información.
        </h2>
        <p className="text-slate-700 mt-3 leading-relaxed">
          Gracias de corazón por completar la inscripción de{' '}
          <strong>{nombreParticipante || 'vuestro hijo/a'}</strong>. El equipo
          del Campus FRP ya tiene todo lo necesario para empezar a prepararle
          una experiencia inolvidable.
        </p>
        <p className="text-slate-700 mt-3 leading-relaxed">
          <strong>Os esperamos en el Campus — nos lo vamos a pasar genial.</strong>
        </p>
        {fecha && (
          <p className="text-xs text-slate-500 mt-4">
            Formulario enviado el {fecha}.
          </p>
        )}
      </div>

      <div className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-4 text-left">
        <strong className="text-slate-900">¿Qué pasa ahora?</strong>
        <ul className="list-disc list-inside mt-2 space-y-1.5">
          <li>El equipo del Campus revisa toda la información con calma.</li>
          <li>
            Si vemos que falta algún detalle o necesitamos aclarar algo, nos
            pondremos en contacto contigo.
          </li>
          <li>
            ¿Algún dato cambió desde que lo enviaste? Puedes modificarlo
            cuando quieras pulsando el botón de abajo. Si la modificación
            afecta a algún apartado firmado, tendrás que volver a firmarlo.
          </li>
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
        {onModificar && (
          <button
            type="button"
            onClick={onModificar}
            className="inline-block rounded-lg bg-amber-700 text-white font-medium px-4 py-2.5 hover:bg-amber-800"
          >
            ✎ Modificar formulario
          </button>
        )}
        <Link
          to="/mis-expedientes"
          className="inline-block rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800"
        >
          Volver a mis expedientes
        </Link>
      </div>
    </div>
  )
}
