import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function Callback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase ya procesa el token en la URL automáticamente
    // (porque tenemos detectSessionInUrl: true en lib/supabase.ts).
    // Esperamos a que la sesión esté lista, comprobamos si es staff y
    // redirigimos al sitio correcto.
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        setError(error.message)
        return
      }
      if (!data.session) {
        setError('No hemos podido validar el enlace. Puede haber caducado.')
        return
      }

      // Si el email está en staff_emails → backoffice
      const email = data.session.user.email
      if (email) {
        const { data: rolData } = await supabase
          .from('staff_emails')
          .select('rol')
          .eq('email', email)
          .maybeSingle()
        if (rolData) {
          navigate('/admin', { replace: true })
          return
        }
      }

      // Familia → mis-expedientes (que auto-reclama invitaciones)
      navigate('/mis-expedientes', { replace: true })
    }, 300)

    return () => clearTimeout(timer)
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Enlace no válido
          </h1>
          <p className="text-slate-600 mt-2 text-sm">{error}</p>
          <a
            href="/"
            className="inline-block mt-4 text-slate-900 underline text-sm"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-500 text-sm">Validando enlace…</div>
    </div>
  )
}
