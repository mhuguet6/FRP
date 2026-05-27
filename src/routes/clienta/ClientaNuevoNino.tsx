import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClientaStatus } from '../../lib/useClientaStatus'
import {
  crearExpedienteDesdeClienta,
  getEdicionActiva,
  type CampusEdicion,
  type DatosNinoClienta,
} from '../../features/expediente/api'
import { PageSpinner } from '../../components/ui/PageSpinner'

const schema = z.object({
  alumno_apellidos: z.string().min(1, 'Obligatorio'),
  alumno_nombre: z.string().min(1, 'Obligatorio'),
  programa: z.enum(['robotica', 'emprendimiento'], {
    error: 'Selecciona el programa',
  }),
  genero: z.string().optional(),
  edad: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{1,3}$/.test(v.trim()), 'Solo números'),
  chozo: z.string().optional(),
  repetidor: z.string().optional(),
  tutor_email: z.string().email('Email no válido'),
  fecha_nacimiento: z
    .string()
    .min(1, 'Obligatoria')
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'Formato AAAA-MM-DD')
    .refine((v) => {
      const d = new Date(v + 'T00:00:00')
      return !Number.isNaN(d.getTime())
    }, 'Fecha no válida')
    .refine((v) => {
      // Edad mínima: 5 años (en la fecha de hoy).
      const d = new Date(v + 'T00:00:00')
      if (Number.isNaN(d.getTime())) return false
      const hoy = new Date()
      const limite = new Date(
        hoy.getFullYear() - 5,
        hoy.getMonth(),
        hoy.getDate()
      )
      return d <= limite
    }, 'El niño/a debe tener al menos 5 años'),
  centro_educativo: z.string().optional(),
  padres: z.string().optional(),
  profesiones: z.string().optional(),
  direccion: z.string().min(1, 'Obligatoria'),
  importe: z.string().optional(),
  observaciones: z.string().optional(),
})

type Values = z.infer<typeof schema>

export function ClientaNuevoNino() {
  const clienta = useClientaStatus()
  const navigate = useNavigate()
  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (clienta.status !== 'clienta') return
    getEdicionActiva()
      .then(setEdicion)
      .catch((e) =>
        setServerError(e instanceof Error ? e.message : 'Error al cargar edición')
      )
  }, [clienta.status])

  if (clienta.status === 'loading') return <PageSpinner />
  if (clienta.status === 'not_clienta') return <Navigate to="/" replace />

  const onSubmit = async (v: Values) => {
    setServerError(null)
    try {
      const datos: DatosNinoClienta = {
        alumno_apellidos: v.alumno_apellidos.trim(),
        alumno_nombre: v.alumno_nombre.trim(),
        programa: v.programa,
        tutor_email: v.tutor_email.trim(),
        fecha_nacimiento: v.fecha_nacimiento,
        direccion: v.direccion.trim(),
        genero: v.genero?.trim() || null,
        edad: v.edad ? parseInt(v.edad, 10) : null,
        chozo: v.chozo?.trim() || null,
        repetidor: v.repetidor?.trim() || null,
        centro_educativo: v.centro_educativo?.trim() || null,
        padres: v.padres?.trim() || null,
        profesiones: v.profesiones?.trim() || null,
        importe: v.importe?.trim() || null,
        observaciones: v.observaciones?.trim() || null,
      }
      await crearExpedienteDesdeClienta(datos, edicion?.id ?? null)
      navigate('/clienta', { replace: true })
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  const { register, handleSubmit, formState } = form
  const errs = formState.errors

  // Fecha máxima permitida en el input: hace exactamente 5 años desde hoy.
  const maxFechaNac = (() => {
    const hoy = new Date()
    const d = new Date(hoy.getFullYear() - 5, hoy.getMonth(), hoy.getDate())
    return d.toISOString().slice(0, 10)
  })()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/clienta"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Volver
          </Link>
          {edicion && (
            <span className="text-xs text-slate-500">{edicion.nombre}</span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">
          Añadir un niño/a
        </h1>
        <p className="text-slate-600 text-sm mb-6">
          Completa los datos básicos. Los campos con{' '}
          <span className="text-red-600">*</span> son obligatorios.
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Apellidos"
              required
              error={errs.alumno_apellidos?.message}
            >
              <input
                type="text"
                className={inputCls}
                {...register('alumno_apellidos')}
              />
            </Field>
            <Field
              label="Nombre"
              required
              error={errs.alumno_nombre?.message}
            >
              <input
                type="text"
                className={inputCls}
                {...register('alumno_nombre')}
              />
            </Field>
            <Field label="Programa" required error={errs.programa?.message}>
              <select
                className={inputCls}
                defaultValue=""
                {...register('programa')}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                <option value="robotica">Robótica</option>
                <option value="emprendimiento">Emprendimiento</option>
              </select>
            </Field>
            <Field
              label="Fecha de nacimiento"
              required
              error={errs.fecha_nacimiento?.message}
            >
              <input
                type="date"
                className={inputCls}
                max={maxFechaNac}
                {...register('fecha_nacimiento')}
              />
            </Field>
            <Field label="Género (opcional)" error={errs.genero?.message}>
              <input type="text" className={inputCls} {...register('genero')} />
            </Field>
            <Field label="Edad (opcional)" error={errs.edad?.message}>
              <input
                type="text"
                inputMode="numeric"
                className={inputCls}
                {...register('edad')}
              />
            </Field>
            <Field label="Chozo / habitación" error={errs.chozo?.message}>
              <input type="text" className={inputCls} {...register('chozo')} />
            </Field>
            <Field label="Repetidor/a" error={errs.repetidor?.message}>
              <select
                className={inputCls}
                defaultValue=""
                {...register('repetidor')}
              >
                <option value="">—</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="Centro educativo" error={errs.centro_educativo?.message}>
              <input
                type="text"
                className={inputCls}
                {...register('centro_educativo')}
              />
            </Field>
            <Field label="Importe" error={errs.importe?.message}>
              <input
                type="text"
                className={inputCls}
                placeholder="p. ej. 1200 €"
                {...register('importe')}
              />
            </Field>
            <Field label="Padres" error={errs.padres?.message}>
              <input
                type="text"
                className={inputCls}
                placeholder="Nombre del padre / madre / tutores"
                {...register('padres')}
              />
            </Field>
            <Field label="Profesiones" error={errs.profesiones?.message}>
              <input
                type="text"
                className={inputCls}
                {...register('profesiones')}
              />
            </Field>
          </div>

          <Field
            label="Correo del tutor"
            required
            error={errs.tutor_email?.message}
          >
            <input
              type="email"
              inputMode="email"
              className={inputCls}
              {...register('tutor_email')}
            />
          </Field>

          <Field
            label="Dirección completa"
            required
            error={errs.direccion?.message}
          >
            <input type="text" className={inputCls} {...register('direccion')} />
          </Field>

          <Field
            label="Observaciones (opcional)"
            error={errs.observaciones?.message}
            hint="Notas internas de la clienta sobre el niño/a. Solo las verá el equipo de Robotix, no la familia."
          >
            <textarea
              rows={4}
              className={inputCls}
              placeholder="Cualquier información útil que quieras transmitir al equipo del Campus…"
              {...register('observaciones')}
            />
          </Field>

          {serverError && (
            <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
              {serverError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Link
              to="/clienta"
              className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 hover:bg-slate-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={formState.isSubmitting}
              className="rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800 disabled:opacity-50"
            >
              {formState.isSubmitting ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

function Field({
  label,
  error,
  required,
  hint,
  children,
}: {
  label: string
  error?: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-slate-500 mt-1">{hint}</p>
      )}
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  )
}
