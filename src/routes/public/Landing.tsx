import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/useSession'
import { useStaffStatus } from '../../lib/useStaffStatus'
import { PageSpinner } from '../../components/ui/PageSpinner'

const loginSchema = z.object({
  email: z.string().email('Introduce un email válido'),
  password: z.string().min(1, 'Introduce tu contraseña'),
})

const magicSchema = z.object({
  email: z.string().email('Introduce un email válido'),
})

type LoginValues = z.infer<typeof loginSchema>
type MagicValues = z.infer<typeof magicSchema>

export function Landing() {
  const navigate = useNavigate()
  const session = useSession()
  const staff = useStaffStatus()
  const [modo, setModo] = useState<'login' | 'magic'>('login')
  const [serverError, setServerError] = useState<string | null>(null)
  const [destino, setDestino] = useState<string | null>(null)

  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })
  const magicForm = useForm<MagicValues>({ resolver: zodResolver(magicSchema) })

  // Si ya estás autenticado, redirige al sitio que corresponda
  useEffect(() => {
    if (session.status !== 'authenticated') return
    if (staff.status === 'loading') return
    setDestino(staff.status === 'staff' ? '/admin' : '/mis-expedientes')
  }, [session, staff])

  if (session.status === 'loading') return <PageSpinner />
  if (destino) return <Navigate to={destino} replace />

  const onLogin = async (values: LoginValues) => {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })
    if (error) {
      setServerError('Email o contraseña incorrectos.')
      return
    }
    // El useEffect de arriba redirige cuando la sesión esté lista.
  }

  const onMagicLink = async (values: MagicValues) => {
    setServerError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        emailRedirectTo: `${window.location.origin}/callback`,
      },
    })
    if (error) {
      setServerError(error.message)
      return
    }
    navigate('/mensaje-enviado', { state: { email: values.email } })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            Campus FRP · Acceso del equipo
          </h1>
          <p className="text-slate-600 mt-2 text-sm">
            Esta herramienta es interna de Robotix. Las familias acceden con el
            enlace que reciben por email.
          </p>
        </div>

        {modo === 'login' ? (
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
            <Field
              label="Email"
              error={loginForm.formState.errors.email?.message}
            >
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="tu@robotix.es"
                className={inputCls}
                {...loginForm.register('email')}
              />
            </Field>

            <Field
              label="Contraseña"
              error={loginForm.formState.errors.password?.message}
            >
              <input
                type="password"
                autoComplete="current-password"
                className={inputCls}
                {...loginForm.register('password')}
              />
            </Field>

            {serverError && (
              <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginForm.formState.isSubmitting}
              className="w-full rounded-lg bg-slate-900 text-white font-medium py-2.5 hover:bg-slate-800 disabled:opacity-50"
            >
              {loginForm.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
            </button>

            <div className="text-center pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setModo('magic')
                  setServerError(null)
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                ¿Familia que perdió el enlace? Solicitar uno nuevo →
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={magicForm.handleSubmit(onMagicLink)}
            className="space-y-4"
          >
            <p className="text-sm text-slate-700">
              Introduce el email donde recibiste el correo de Robotix y te
              reenviamos el enlace.
            </p>
            <Field
              label="Email"
              error={magicForm.formState.errors.email?.message}
            >
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="tucorreo@ejemplo.com"
                className={inputCls}
                {...magicForm.register('email')}
              />
            </Field>

            {serverError && (
              <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={magicForm.formState.isSubmitting}
              className="w-full rounded-lg bg-slate-900 text-white font-medium py-2.5 hover:bg-slate-800 disabled:opacity-50"
            >
              {magicForm.formState.isSubmitting
                ? 'Enviando…'
                : 'Recibir enlace por email'}
            </button>

            <div className="text-center pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setModo('login')
                  setServerError(null)
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                ← Volver al acceso del equipo
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  )
}
