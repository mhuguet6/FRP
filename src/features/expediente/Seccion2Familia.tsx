import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CampusEdicion, Expediente } from './api'
import { useAutosave } from '../../lib/useAutosave'
import { IndicadorGuardado } from '../../components/ui/IndicadorGuardado'
import { ErrorBanner, MSG_FALTAN_RESPUESTAS } from '../../components/ui/ErrorBanner'

const RELACIONES = [
  'Padre',
  'Madre',
  'Tutor/a legal',
  'Abuelo/a',
  'Tío/a',
  'Hermano/a',
  'Otro',
] as const

// DNI español (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos + letra)
const DNI_REGEX = /^([XYZ]\d{7}|\d{8})[A-Za-z]$/

// Teléfono: aceptamos
//  - Forma internacional nueva +CCdígitos (la que escribe la UI nueva)
//  - Forma legacy de solo dígitos (datos antiguos pre-prefijo)
const TELEFONO_REGEX = /^(\+\d{8,18}|\d{9,15})$/

// Lista de prefijos disponibles en el selector
const PREFIJOS: Array<{ code: string; label: string }> = [
  { code: '+34', label: 'España' },
  { code: '+33', label: 'Francia' },
  { code: '+351', label: 'Portugal' },
  { code: '+39', label: 'Italia' },
  { code: '+49', label: 'Alemania' },
  { code: '+44', label: 'Reino Unido' },
  { code: '+41', label: 'Suiza' },
  { code: '+32', label: 'Bélgica' },
  { code: '+31', label: 'Países Bajos' },
  { code: '+212', label: 'Marruecos' },
  { code: '+1', label: 'EE.UU. / Canadá' },
  { code: '+52', label: 'México' },
  { code: '+54', label: 'Argentina' },
  { code: '+57', label: 'Colombia' },
  { code: '+55', label: 'Brasil' },
]

const contactoSchema = z.object({
  telefono: z
    .string()
    .min(1, 'Obligatorio')
    .regex(TELEFONO_REGEX, 'Solo números (9 dígitos)'),
  nombre: z.string().min(1, 'Obligatorio'),
  relacion: z.enum(RELACIONES, { message: 'Selecciona una relación' }),
})

const contactoOpcionalSchema = z
  .object({
    telefono: z.string().optional().or(z.literal('')),
    nombre: z.string().optional().or(z.literal('')),
    relacion: z.enum(RELACIONES).optional(),
  })
  .refine(
    (v) => {
      const algo = !!(v.telefono || v.nombre || v.relacion)
      if (!algo) return true
      return !!(v.telefono && v.nombre && v.relacion)
    },
    { message: 'Si añades un contacto, completa los tres campos' }
  )
  .refine(
    (v) => !v.telefono || TELEFONO_REGEX.test(v.telefono),
    { message: 'Solo números (9 dígitos)', path: ['telefono'] }
  )

const schema = z.object({
  tutor_nombre: z.string().min(1, 'Obligatorio'),
  tutor_dni: z
    .string()
    .min(1, 'Obligatorio')
    .regex(DNI_REGEX, 'Formato no válido. Ejemplo: 12345678A'),
  email_contacto: z
    .string()
    .min(1, 'Obligatorio')
    .email('Email no válido'),
  contactos: z
    .tuple([contactoSchema])
    .rest(contactoOpcionalSchema)
    .refine((arr) => arr.length >= 1 && arr.length <= 3, {
      message: 'Entre 1 y 3 contactos',
    }),
})

export type Seccion2Values = z.infer<typeof schema>

type Props = {
  expediente: Expediente
  edicion: CampusEdicion | null
  authEmail: string | null
  onSave: (patch: {
    columnas: Partial<Expediente>
    respuestas: Partial<Seccion2Values>
  }) => Promise<void>
  onPrev: () => void
  onNext: () => Promise<void>
}

export function Seccion2Familia({
  expediente,
  authEmail,
  onSave,
  onPrev,
  onNext,
}: Props) {
  const previo = (expediente.respuestas?.seccion2 as
    | Partial<Seccion2Values>
    | undefined) ?? {}

  const contactosPrevios = previo.contactos ?? []
  const defaultContactos = [
    contactosPrevios[0] ?? { telefono: '', nombre: '', relacion: undefined as never },
    ...contactosPrevios.slice(1),
  ]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Seccion2Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      tutor_nombre: expediente.tutor_nombre ?? previo.tutor_nombre ?? '',
      tutor_dni: expediente.tutor_dni ?? previo.tutor_dni ?? '',
      email_contacto:
        expediente.tutor_email ?? previo.email_contacto ?? authEmail ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contactos: defaultContactos as any,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    name: 'contactos' as any,
  })

  const values = watch()

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      const tel1 = v.contactos?.[0]?.telefono ?? null
      await onSave({
        columnas: {
          tutor_nombre: v.tutor_nombre || null,
          tutor_dni: v.tutor_dni || null,
          tutor_email: v.email_contacto || null,
          tutor_telefono: tel1,
        },
        respuestas: v,
      })
    },
  })

  const [submitError, setSubmitError] = useState<string | null>(null)
  const onValid = async () => {
    setSubmitError(null)
    await onNext()
  }
  const onInvalid = () => setSubmitError(MSG_FALTAN_RESPUESTAS)

  const puedeAnadir = fields.length < 3
  const onAnadir = () =>
    append({ telefono: '', nombre: '', relacion: undefined as never })

  return (
    <form
      onSubmit={handleSubmit(onValid, onInvalid)}
      className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Familia y contactos
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Datos del padre, madre o tutor/a que firma la inscripción y
            personas de contacto en orden de prioridad.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
          Tutor/a que firma
        </h3>

        <Field label="Nombre y apellidos" error={errors.tutor_nombre?.message}>
          <input
            type="text"
            autoComplete="name"
            className={inputCls}
            {...register('tutor_nombre')}
          />
        </Field>

        <Field
          label="DNI"
          error={errors.tutor_dni?.message}
        >
          <input
            type="text"
            inputMode="text"
            placeholder="12345678A"
            maxLength={9}
            className={inputCls + ' uppercase'}
            {...register('tutor_dni', {
              setValueAs: (v: string) =>
                (v ?? '').replace(/\s+/g, '').toUpperCase(),
            })}
          />
        </Field>

        <Field
          label="Email de contacto familiar"
          error={errors.email_contacto?.message}
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            className={inputCls}
            {...register('email_contacto')}
          />
          <p className="text-xs text-slate-500 mt-1">
            Lo hemos rellenado con el email con el que entraste. Puedes
            cambiarlo si prefieres recibir las comunicaciones en otro.
          </p>
        </Field>
      </div>

      <div className="space-y-4 border-t border-slate-200 pt-6">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
          Personas de contacto
        </h3>
        <p className="text-slate-600 text-sm -mt-2">
          Indica en orden de prioridad a quién podemos llamar.
        </p>

        {fields.map((field, idx) => {
          const contactoErrors =
            errors.contactos?.[idx] as
              | {
                  telefono?: { message?: string }
                  nombre?: { message?: string }
                  relacion?: { message?: string }
                  message?: string
                }
              | undefined
          return (
            <div
              key={field.id}
              className="rounded-xl border border-slate-200 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">
                  Contacto {idx + 1}
                  {idx === 0 && (
                    <span className="text-xs text-slate-500 font-normal ml-1">
                      (obligatorio)
                    </span>
                  )}
                </div>
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>

              <Field label="Teléfono" error={contactoErrors?.telefono?.message}>
                <InputTelefono
                  name={`contactos.${idx}.telefono` as const}
                  watch={watch}
                  setValue={setValue}
                />
              </Field>

              <Field label="Nombre" error={contactoErrors?.nombre?.message}>
                <input
                  type="text"
                  className={inputCls}
                  {...register(`contactos.${idx}.nombre` as const)}
                />
              </Field>

              <Field
                label="Relación con el/la participante"
                error={contactoErrors?.relacion?.message}
              >
                <select
                  className={inputCls}
                  defaultValue=""
                  {...register(`contactos.${idx}.relacion` as const)}
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {RELACIONES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>

              {contactoErrors?.message && (
                <p className="text-red-600 text-sm">{contactoErrors.message}</p>
              )}
            </div>
          )
        })}

        {puedeAnadir && (
          <button
            type="button"
            onClick={onAnadir}
            className="w-full rounded-lg border border-dashed border-slate-300 text-slate-600 font-medium py-2.5 hover:bg-slate-50"
          >
            + Añadir otro teléfono
          </button>
        )}
      </div>

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 hover:bg-slate-50"
        >
          ← Atrás
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800 disabled:opacity-50"
        >
          Siguiente →
        </button>
      </div>
    </form>
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

// Input de teléfono con selector de prefijo internacional.
// El valor en el form se guarda como string concatenado "+34600111222".
function parseTelefono(valor: string): { prefijo: string; digitos: string } {
  if (typeof valor !== 'string' || !valor) {
    return { prefijo: '+34', digitos: '' }
  }
  if (valor.startsWith('+')) {
    // Ordenamos por longitud descendente para que +351 gane sobre +3.
    const ordenados = [...PREFIJOS].sort(
      (a, b) => b.code.length - a.code.length
    )
    for (const p of ordenados) {
      if (valor.startsWith(p.code)) {
        return { prefijo: p.code, digitos: valor.slice(p.code.length) }
      }
    }
    // Prefijo desconocido en datos viejos: lo descartamos y caemos a +34.
    return { prefijo: '+34', digitos: valor.replace(/^\+\d+/, '') }
  }
  // Sin prefijo (datos legacy) → asumimos España.
  return { prefijo: '+34', digitos: valor }
}

function InputTelefono({
  name,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue,
}: {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: any
}) {
  const valorActual = (watch(name) ?? '') as string
  const { prefijo, digitos } = parseTelefono(valorActual)
  const emit = (nuevoPrefijo: string, nuevosDigitos: string) =>
    setValue(name, nuevoPrefijo + nuevosDigitos, {
      shouldDirty: true,
      shouldValidate: true,
    })
  return (
    <div className="flex gap-2">
      <select
        value={prefijo}
        onChange={(e) => emit(e.target.value, digitos)}
        className="rounded-lg border border-slate-300 px-2 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white shrink-0"
        aria-label="Prefijo país"
      >
        {PREFIJOS.map((p) => (
          <option key={p.code} value={p.code}>
            {p.code} {p.label}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        maxLength={15}
        pattern="[0-9]*"
        placeholder="600111222"
        value={digitos}
        onChange={(e) => emit(prefijo, e.target.value.replace(/\D/g, ''))}
        className={`${inputCls} flex-1`}
      />
    </div>
  )
}
