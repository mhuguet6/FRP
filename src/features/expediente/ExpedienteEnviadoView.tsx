import { Link } from 'react-router-dom'
import type { Expediente } from './api'

export function ExpedienteEnviadoView({ expediente }: { expediente: Expediente }) {
  const fecha = expediente.submitted_at
    ? new Date(expediente.submitted_at).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 text-center">
      <div className="text-5xl">✓</div>
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Formulario enviado
        </h2>
        <p className="text-slate-600 text-sm mt-2">
          Hemos recibido la inscripción de{' '}
          <strong>
            {expediente.alumno_nombre} {expediente.alumno_apellidos}
          </strong>
          .
          {fecha && (
            <>
              <br />
              Enviado el {fecha}.
            </>
          )}
        </p>
      </div>
      <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-4 text-left">
        <strong className="text-slate-900">Próximos pasos:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>El equipo del Campus revisará la información.</li>
          <li>
            Si necesitamos alguna corrección o aclaración nos pondremos en
            contacto contigo.
          </li>
          <li>
            Si necesitas modificar algo, escríbenos respondiendo a este email
            de inscripción.
          </li>
        </ul>
      </div>
      <Link
        to="/mis-expedientes"
        className="inline-block rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800"
      >
        Volver a mis expedientes
      </Link>
    </div>
  )
}
