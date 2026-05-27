import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useStaffStatus } from '../../lib/useStaffStatus'
import {
  crearStaff,
  getEdicionActiva,
  type CampusEdicion,
  type DatosStaff,
} from '../../features/expediente/api'
import { PageSpinner } from '../../components/ui/PageSpinner'

const HORAS_DISPONIBLES: string[] = Array.from({ length: 16 }, (_, i) =>
  `${String(7 + i).padStart(2, '0')}:00`
)

// DNI español (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos + letra)
const DNI_REGEX = /^([XYZ]\d{7}|\d{8})[A-Za-z]$/

const medSchema = z.object({
  nombre: z.string().min(1, 'Obligatorio'),
  dosis: z.string().min(1, 'Obligatorio'),
  horarios: z.array(z.string()).default([]),
  prn: z.boolean().default(false),
  indicaciones: z.string().optional().default(''),
})

const schema = z
  .object({
    nombre: z.string().min(1, 'Obligatorio'),
    apellidos: z.string().min(1, 'Obligatorio'),
    fecha_nacimiento: z
      .string()
      .optional()
      .default('')
      .refine(
        (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v),
        'Formato AAAA-MM-DD'
      )
      .refine((v) => {
        if (!v) return true
        const d = new Date(v + 'T00:00:00')
        if (Number.isNaN(d.getTime())) return false
        const hoy = new Date()
        const limite = new Date(
          hoy.getFullYear() - 16,
          hoy.getMonth(),
          hoy.getDate()
        )
        return d <= limite
      }, 'El staff debe tener al menos 16 años'),
    dni: z
      .string()
      .optional()
      .default('')
      .refine(
        (v) => !v || DNI_REGEX.test(v),
        'Formato no válido. Ej: 12345678A o X1234567A'
      ),
    email: z.string().email('Email no válido'),
    telefono: z.string().optional().default(''),
    programa: z
      .union([z.literal(''), z.literal('robotica'), z.literal('emprendimiento')])
      .default(''),
    tiene_alergias: z.boolean().default(false),
    alergias_detalle: z.string().optional().default(''),
    alergias_reaccion: z.string().optional().default(''),
    tiene_dieta: z.boolean().default(false),
    dieta_detalle: z.string().optional().default(''),
    come: z
      .union([
        z.literal(''),
        z.literal('poco'),
        z.literal('normal'),
        z.literal('mucho'),
        z.literal('varia'),
      ])
      .default(''),
    toma_medicacion: z.boolean().default(false),
    medicamentos: z.array(medSchema).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.tiene_alergias && !v.alergias_detalle?.trim()) {
      ctx.addIssue({
        path: ['alergias_detalle'],
        code: z.ZodIssueCode.custom,
        message: 'Indica a qué',
      })
    }
    if (v.tiene_dieta && !v.dieta_detalle?.trim()) {
      ctx.addIssue({
        path: ['dieta_detalle'],
        code: z.ZodIssueCode.custom,
        message: 'Describe la dieta',
      })
    }
    if (v.toma_medicacion) {
      if (v.medicamentos.length === 0) {
        ctx.addIssue({
          path: ['medicamentos'],
          code: z.ZodIssueCode.custom,
          message: 'Añade al menos un medicamento',
        })
      }
      v.medicamentos.forEach((m, i) => {
        if ((m.horarios ?? []).length === 0 && !m.prn) {
          ctx.addIssue({
            path: ['medicamentos', i, 'horarios'],
            code: z.ZodIssueCode.custom,
            message: 'Marca al menos una hora o "según necesidad"',
          })
        }
      })
    }
  })

type Values = z.input<typeof schema>

export function AdminNuevoStaff() {
  const staff = useStaffStatus()
  const navigate = useNavigate()
  const [edicion, setEdicion] = useState<CampusEdicion | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: '',
      apellidos: '',
      fecha_nacimiento: '',
      dni: '',
      email: '',
      telefono: '',
      programa: '',
      tiene_alergias: false,
      alergias_detalle: '',
      alergias_reaccion: '',
      tiene_dieta: false,
      dieta_detalle: '',
      come: '',
      toma_medicacion: false,
      medicamentos: [],
    },
  })
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = form

  const medArray = useFieldArray({ control, name: 'medicamentos' })

  const tieneAlergias = watch('tiene_alergias')
  const tieneDieta = watch('tiene_dieta')
  const tomaMed = watch('toma_medicacion')

  // Fecha máxima permitida: hace exactamente 16 años desde hoy.
  const maxFechaNac = (() => {
    const hoy = new Date()
    const d = new Date(hoy.getFullYear() - 16, hoy.getMonth(), hoy.getDate())
    return d.toISOString().slice(0, 10)
  })()

  useEffect(() => {
    if (staff.status !== 'staff') return
    getEdicionActiva()
      .then(setEdicion)
      .catch((e) =>
        setServerError(e instanceof Error ? e.message : 'Error al cargar edición')
      )
  }, [staff.status])

  // Si marcan "Toma medicación" y no hay filas, auto-añadir una.
  useEffect(() => {
    if (tomaMed && medArray.fields.length === 0) {
      medArray.append({
        nombre: '',
        dosis: '',
        horarios: [],
        prn: false,
        indicaciones: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tomaMed])

  if (staff.status === 'loading') return <PageSpinner />
  if (staff.status === 'not_staff') return <Navigate to="/" replace />

  const onSubmit = async (v: Values) => {
    setServerError(null)
    try {
      const programaSel = v.programa ?? ''
      const comeSel = v.come ?? ''
      const datos: DatosStaff = {
        nombre: v.nombre.trim(),
        apellidos: v.apellidos.trim(),
        fecha_nacimiento: v.fecha_nacimiento || null,
        dni: (v.dni ?? '').trim(),
        email: v.email.trim(),
        telefono: (v.telefono ?? '').trim(),
        programa:
          programaSel === '' ? null : (programaSel as 'robotica' | 'emprendimiento'),
        tiene_alergias: !!v.tiene_alergias,
        alergias_detalle: v.alergias_detalle?.trim() ?? '',
        alergias_reaccion: v.alergias_reaccion?.trim() ?? '',
        tiene_dieta: !!v.tiene_dieta,
        dieta_detalle: v.dieta_detalle?.trim() ?? '',
        come: comeSel as DatosStaff['come'],
        toma_medicacion: !!v.toma_medicacion,
        medicamentos: v.toma_medicacion
          ? (v.medicamentos ?? []).map((m) => ({
              nombre: m.nombre.trim(),
              dosis: m.dosis.trim(),
              horarios: m.horarios ?? [],
              prn: m.prn ?? false,
              indicaciones: m.indicaciones?.trim() ?? '',
            }))
          : [],
      }
      await crearStaff(datos, edicion?.id ?? null)
      navigate('/admin', { replace: true })
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/admin" className="text-sm text-slate-600 hover:text-slate-900">
            ← Volver
          </Link>
          {edicion && (
            <span className="text-xs text-slate-500">{edicion.nombre}</span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">
          Añadir miembro del staff
        </h1>
        <p className="text-slate-600 text-sm mb-6">
          Solo visible en el panel de Robotix. Se asigna un código{' '}
          <code>STF-AAAA-NNN</code> automáticamente.
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5"
        >
          {/* Datos básicos */}
          <Bloque titulo="Datos básicos">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nombre" required error={errors.nombre?.message}>
                <input type="text" className={inputCls} {...register('nombre')} />
              </Field>
              <Field
                label="Apellidos"
                required
                error={errors.apellidos?.message}
              >
                <input
                  type="text"
                  className={inputCls}
                  {...register('apellidos')}
                />
              </Field>
              <Field
                label="Fecha de nacimiento"
                error={errors.fecha_nacimiento?.message}
              >
                <input
                  type="date"
                  className={inputCls}
                  max={maxFechaNac}
                  {...register('fecha_nacimiento')}
                />
              </Field>
              <Field
                label="DNI / NIE"
                error={errors.dni?.message}
                hint="Ej: 12345678A · NIE: X1234567A"
              >
                <input
                  type="text"
                  className={inputCls}
                  placeholder="12345678A"
                  maxLength={9}
                  autoComplete="off"
                  {...register('dni', {
                    onBlur: (e) => {
                      const limpio = (e.target.value ?? '')
                        .replace(/\s+/g, '')
                        .toUpperCase()
                      if (e.target.value !== limpio) {
                        setValue('dni', limpio, { shouldValidate: true })
                      }
                    },
                  })}
                />
              </Field>
              <Field label="Email" required error={errors.email?.message}>
                <input
                  type="email"
                  inputMode="email"
                  className={inputCls}
                  {...register('email')}
                />
              </Field>
              <Field label="Teléfono" error={errors.telefono?.message}>
                <input
                  type="tel"
                  inputMode="tel"
                  className={inputCls}
                  placeholder="+34600111222"
                  {...register('telefono')}
                />
              </Field>
              <Field label="Programa" error={errors.programa?.message}>
                <select
                  className={inputCls}
                  defaultValue=""
                  {...register('programa')}
                >
                  <option value="">— Sin asignar</option>
                  <option value="robotica">Robótica</option>
                  <option value="emprendimiento">Emprendimiento</option>
                </select>
              </Field>
            </div>
          </Bloque>

          {/* Alergias */}
          <Bloque titulo="Alergias">
            <CheckboxFila
              label="Tiene alguna alergia"
              checked={!!watch('tiene_alergias')}
              onChange={(v) => setValue('tiene_alergias', v)}
            />
            {tieneAlergias && (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="¿A qué?"
                  required
                  error={errors.alergias_detalle?.message}
                >
                  <input
                    type="text"
                    className={inputCls}
                    {...register('alergias_detalle')}
                  />
                </Field>
                <Field label="Reacción" error={errors.alergias_reaccion?.message}>
                  <input
                    type="text"
                    className={inputCls}
                    {...register('alergias_reaccion')}
                  />
                </Field>
              </div>
            )}
          </Bloque>

          {/* Comida */}
          <Bloque titulo="Comida">
            <CheckboxFila
              label="Sigue una dieta especial"
              checked={!!watch('tiene_dieta')}
              onChange={(v) => setValue('tiene_dieta', v)}
            />
            {tieneDieta && (
              <Field
                label="Describe la dieta"
                required
                error={errors.dieta_detalle?.message}
              >
                <input
                  type="text"
                  className={inputCls}
                  {...register('dieta_detalle')}
                />
              </Field>
            )}
            <Field label="Suele comer">
              <select
                className={inputCls}
                defaultValue=""
                {...register('come')}
              >
                <option value="">— Sin indicar</option>
                <option value="poco">Poco</option>
                <option value="normal">Normal</option>
                <option value="mucho">Mucho</option>
                <option value="varia">Varía</option>
              </select>
            </Field>
          </Bloque>

          {/* Medicación */}
          <Bloque titulo="Medicación durante el Campus">
            <CheckboxFila
              label="Necesita tomar medicación durante el Campus"
              checked={!!watch('toma_medicacion')}
              onChange={(v) => setValue('toma_medicacion', v)}
            />
            {tomaMed && (
              <div className="space-y-3">
                {medArray.fields.map((f, idx) => {
                  const errs = errors.medicamentos?.[idx]
                  return (
                    <div
                      key={f.id}
                      className="rounded-xl border border-slate-200 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-slate-700">
                          Medicamento {idx + 1}
                        </div>
                        {medArray.fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => medArray.remove(idx)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Quitar
                          </button>
                        )}
                      </div>

                      <Field
                        label="Nombre"
                        required
                        error={errs?.nombre?.message}
                      >
                        <input
                          type="text"
                          className={inputCls}
                          {...register(`medicamentos.${idx}.nombre` as const)}
                        />
                      </Field>
                      <Field label="Dosis" required error={errs?.dosis?.message}>
                        <input
                          type="text"
                          className={inputCls}
                          placeholder="p. ej. 1 comprimido"
                          {...register(`medicamentos.${idx}.dosis` as const)}
                        />
                      </Field>

                      <Field
                        label="Horario de administración"
                        error={errs?.horarios?.message}
                      >
                        <SelectorHorario
                          horarios={
                            (watch(`medicamentos.${idx}.horarios`) as
                              | string[]
                              | undefined) ?? []
                          }
                          prn={
                            (watch(`medicamentos.${idx}.prn`) as
                              | boolean
                              | undefined) ?? false
                          }
                          onChangeHorarios={(h) =>
                            setValue(`medicamentos.${idx}.horarios`, h, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          onChangePrn={(v) =>
                            setValue(`medicamentos.${idx}.prn`, v, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                        />
                      </Field>

                      <Field label="Indicaciones (opcional)">
                        <textarea
                          rows={2}
                          className={inputCls}
                          {...register(
                            `medicamentos.${idx}.indicaciones` as const
                          )}
                        />
                      </Field>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() =>
                    medArray.append({
                      nombre: '',
                      dosis: '',
                      horarios: [],
                      prn: false,
                      indicaciones: '',
                    })
                  }
                  className="w-full rounded-lg border border-dashed border-slate-300 text-slate-600 font-medium py-2.5 hover:bg-slate-50"
                >
                  + Añadir otro medicamento
                </button>
                {errors.medicamentos?.message && (
                  <p className="text-red-600 text-sm">
                    {errors.medicamentos.message as string}
                  </p>
                )}
              </div>
            )}
          </Bloque>

          {serverError && (
            <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
              {serverError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Link
              to="/admin"
              className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 hover:bg-slate-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando…' : 'Guardar staff'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

function Bloque({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      {children}
    </div>
  )
}

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

function CheckboxFila({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span>{label}</span>
    </label>
  )
}

function SelectorHorario({
  horarios,
  prn,
  onChangeHorarios,
  onChangePrn,
}: {
  horarios: string[]
  prn: boolean
  onChangeHorarios: (h: string[]) => void
  onChangePrn: (v: boolean) => void
}) {
  const seleccionadas = new Set(horarios)
  const toggle = (h: string) => {
    const next = new Set(seleccionadas)
    if (next.has(h)) next.delete(h)
    else next.add(h)
    onChangeHorarios(Array.from(next).sort())
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {HORAS_DISPONIBLES.map((h) => {
          const activo = seleccionadas.has(h)
          return (
            <button
              key={h}
              type="button"
              aria-pressed={activo}
              onClick={() => toggle(h)}
              className={
                activo
                  ? 'rounded-lg border px-2 py-1.5 text-sm font-medium bg-slate-900 text-white border-slate-900'
                  : 'rounded-lg border px-2 py-1.5 text-sm font-medium bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
              }
            >
              {h}
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
        <input
          type="checkbox"
          checked={prn}
          onChange={(e) => onChangePrn(e.target.checked)}
        />
        <span>Según necesidad (sin horario fijo)</span>
      </label>
    </div>
  )
}
