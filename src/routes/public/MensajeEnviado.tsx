import { Link, useLocation } from 'react-router-dom'

export function MensajeEnviado() {
  const location = useLocation()
  const email = (location.state as { email?: string } | null)?.email

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-6 sm:p-8 text-center">
        <div className="text-4xl mb-3">✉️</div>
        <h1 className="text-xl font-semibold text-slate-900">
          Revisa tu email
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          {email ? (
            <>
              Hemos enviado un enlace a <strong>{email}</strong>.
            </>
          ) : (
            'Hemos enviado un enlace a tu email.'
          )}{' '}
          Ábrelo desde el mismo móvil u ordenador para continuar.
        </p>

        <div className="mt-6 text-sm text-slate-500">
          ¿No te llega?{' '}
          <Link to="/" className="text-slate-900 underline">
            Intenta de nuevo
          </Link>
          .
        </div>
      </div>
    </div>
  )
}
