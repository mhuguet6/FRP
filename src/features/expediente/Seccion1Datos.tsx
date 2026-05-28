import { useEffect, useState } from 'react'
import { useForm, useFieldArray, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Expediente, CampusEdicion } from './api'
import { useAutosave } from '../../lib/useAutosave'
import { IndicadorGuardado } from '../../components/ui/IndicadorGuardado'
import { ErrorBanner, MSG_FALTAN_RESPUESTAS } from '../../components/ui/ErrorBanner'
import { FotoUpload } from './FotoUpload'
import { InputTelefono, TELEFONO_REGEX } from './InputTelefono'

// ----------------------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------------------

const RELACIONES = [
  'Padre',
  'Madre',
  'Tutor/a legal',
  'Abuelo/a',
  'Tío/a',
  'Hermano/a',
  'Otro',
] as const

const CURSOS = [
  '5º Primaria',
  '6º Primaria',
  '1º ESO',
  '2º ESO',
  '3º ESO',
  '4º ESO',
  '1º Bachillerato',
  '2º Bachillerato',
  'Otros',
] as const

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

const contactoExtra = z.object({
  relacion: z.enum(RELACIONES, { message: 'Selecciona una relación' }),
  telefono: z.string().regex(TELEFONO_REGEX, 'Solo números (9 dígitos)'),
  email: z.string().email('Email no válido'),
  dias_llamada: z
    .array(z.string())
    .min(1, 'Selecciona al menos un día'),
})

const schema = z
  .object({
    // Apartado A — Datos del participante
    nombre: z.string().min(1, 'Obligatorio'),
    apellidos: z.string().min(1, 'Obligatorio'),
    fecha_nacimiento: z
      .string()
      .min(1, 'Obligatorio')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha no válida'),
    curso: z.enum(CURSOS, { message: 'Selecciona curso' }),
    curso_otro: z.string().optional(),
    // Apartado B — Contacto principal (tutor que firma)
    relacion_familiar: z.enum(RELACIONES, { message: 'Selecciona una relación' }),
    telefono: z.string().regex(TELEFONO_REGEX, 'Solo números (9 dígitos)'),
    direccion: z.string().min(1, 'Obligatorio'),
    email: z.string().email('Email no válido'),
    dias_llamada: z
      .array(z.string())
      .min(1, 'Selecciona al menos un día'),
    // Contactos adicionales (hasta 2 más)
    contactos_extra: z.array(contactoExtra).max(2),
  })
  .superRefine((v, ctx) => {
    if (v.curso === 'Otros' && !v.curso_otro?.trim()) {
      ctx.addIssue({
        path: ['curso_otro'],
        code: z.ZodIssueCode.custom,
        message: 'Especifica el curso',
      })
    }
  })

export type Seccion1Values = z.input<typeof schema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function calcularEdad(fechaNac: string, fechaInicio: string): number | null {
  if (!fechaNac || !fechaInicio) return null
  const nac = new Date(fechaNac)
  const ini = new Date(fechaInicio)
  if (Number.isNaN(nac.getTime()) || Number.isNaN(ini.getTime())) return null
  let edad = ini.getFullYear() - nac.getFullYear()
  const m = ini.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && ini.getDate() < nac.getDate())) edad--
  return edad
}

function formatearFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

// ----------------------------------------------------------------------------
// Componente
// ----------------------------------------------------------------------------

type Props = {
  expediente: Expediente
  edicion: CampusEdicion | null
  onSave: (patch: {
    columnas: Partial<Expediente>
    respuestas: Record<string, unknown>
  }) => Promise<void>
  onFotoChange: (path: string | null) => Promise<void>
  onPrev?: () => void
  onNext: () => Promise<void>
}

export function Seccion1Datos({
  expediente,
  edicion,
  onSave,
  onFotoChange,
  onPrev,
  onNext,
}: Props) {
  const previo =
    (expediente.respuestas?.seccion1 as Partial<Seccion1Values> | undefined) ??
    {}

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Seccion1Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      nombre: expediente.alumno_nombre ?? previo.nombre ?? '',
      apellidos: expediente.alumno_apellidos ?? previo.apellidos ?? '',
      fecha_nacimiento:
        expediente.fecha_nacimiento ?? previo.fecha_nacimiento ?? '',
      curso: (previo.curso as Seccion1Values['curso']) ?? undefined,
      curso_otro: previo.curso_otro ?? '',
      relacion_familiar:
        (previo.relacion_familiar as Seccion1Values['relacion_familiar']) ??
        undefined,
      telefono: previo.telefono ?? expediente.tutor_telefono ?? '',
      direccion: previo.direccion ?? '',
      email: previo.email ?? expediente.tutor_email ?? '',
      dias_llamada: previo.dias_llamada ?? [],
      contactos_extra: previo.contactos_extra ?? [],
    },
  })

  const extraArray = useFieldArray({ control, name: 'contactos_extra' })
  const values = watch()
  const cursoSel = watch('curso')
  const edad = calcularEdad(
    values.fecha_nacimiento ?? '',
    edicion?.fecha_inicio ?? ''
  )

  const fechasLlamada = edicion?.fechas_llamada_familias ?? []

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      await onSave({
        columnas: {
          alumno_nombre: v.nombre || null,
          alumno_apellidos: v.apellidos || null,
          fecha_nacimiento: v.fecha_nacimiento || null,
          tutor_telefono: v.telefono || null,
          tutor_email: v.email || null,
        },
        respuestas: v as Record<string, unknown>,
      })
    },
  })

  // Cuando se completan los campos básicos por primera vez, marcar en_progreso
  useEffect(() => {
    if (
      expediente.estado === 'creado' &&
      values.nombre &&
      values.apellidos &&
      values.fecha_nacimiento
    ) {
      onSave({
        columnas: { estado: 'en_progreso' },
        respuestas: values as Record<string, unknown>,
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expediente.estado,
    values.nombre,
    values.apellidos,
    values.fecha_nacimiento,
  ])

  const [submitError, setSubmitError] = useState<string | null>(null)
  const onValid = async () => {
    if (!expediente.foto_path) {
      setSubmitError('Debes subir una foto del/de la participante.')
      return
    }
    setSubmitError(null)
    await onNext()
  }
  const onInvalid = () => setSubmitError(MSG_FALTAN_RESPUESTAS)

  return (
    <form
      onSubmit={handleSubmit(onValid, onInvalid)}
      className="bg-white rounded-2xl border border-slate-200 p-6 space-y-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Datos del/de la participante
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Información básica del/de la participante en el Campus FRP.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      {/* ============ Apartado A — Datos del participante ============ */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-900 border-b border-slate-200 pb-2">
          Datos del participante
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre" error={errors.nombre?.message}>
            <input
              type="text"
              autoComplete="given-name"
              className={inputCls}
              {...register('nombre')}
            />
          </Field>
          <Field label="Apellidos" error={errors.apellidos?.message}>
            <input
              type="text"
              autoComplete="family-name"
              className={inputCls}
              {...register('apellidos')}
            />
          </Field>
        </div>

        <Field
          label="Fecha de nacimiento"
          error={errors.fecha_nacimiento?.message}
        >
          <input
            type="date"
            className={inputCls}
            {...register('fecha_nacimiento')}
          />
          {edad !== null && (
            <p className="text-xs text-slate-500 mt-1">
              Edad al inicio del Campus: <strong>{edad} años</strong>
              {edicion && (
                <>
                  {' '}
                  (inicio:{' '}
                  {new Date(edicion.fecha_inicio).toLocaleDateString('es-ES')})
                </>
              )}
            </p>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Curso escolar" error={errors.curso?.message}>
            <select
              className={inputCls}
              defaultValue=""
              {...register('curso')}
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {CURSOS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          {cursoSel === 'Otros' && (
            <Field
              label="Especifica el curso"
              error={errors.curso_otro?.message}
            >
              <input
                type="text"
                className={inputCls}
                {...register('curso_otro')}
              />
            </Field>
          )}
        </div>
      </section>

      {/* ============ Apartado B — Contacto a familiares ============ */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-900 border-b border-slate-200 pb-2">
          Contacto a familiares
        </h3>

        {/* Foto del participante */}
        <FotoUpload
          expedienteId={expediente.id}
          fotoPath={expediente.foto_path}
          onChange={onFotoChange}
        />

        <p className="text-xs text-slate-500">
          Datos del adulto que firma el formulario.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Relación familiar"
            error={errors.relacion_familiar?.message}
          >
            <select
              className={inputCls}
              defaultValue=""
              {...register('relacion_familiar')}
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
          <Field label="Teléfono" error={errors.telefono?.message}>
            <InputTelefono
              name="telefono"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              control={control as Control<any>}
            />
          </Field>
        </div>

        <Field label="Dirección completa" error={errors.direccion?.message}>
          <textarea
            rows={2}
            className={inputCls}
            placeholder="Calle, número, código postal, ciudad"
            {...register('direccion')}
          />
        </Field>

        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            inputMode="email"
            className={inputCls}
            {...register('email')}
          />
        </Field>

        <Field
          label="Mejor día para llamaros (marca uno o varios)"
          error={errors.dias_llamada?.message as string | undefined}
        >
          {fechasLlamada.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aún no hay fechas configuradas para esta edición.
            </p>
          ) : (
            <div className="space-y-1.5">
              {fechasLlamada.map((f) => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    value={f}
                    {...register('dias_llamada')}
                  />
                  <span>{formatearFecha(f)}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer border-t border-slate-200 pt-1.5 mt-1">
                <input
                  type="checkbox"
                  value="cualquiera"
                  {...register('dias_llamada')}
                />
                <span>Cualquier día</span>
              </label>
            </div>
          )}
        </Field>

        {/* Contactos adicionales */}
        <div className="space-y-3 pt-2">
          {extraArray.fields.map((field, idx) => {
            const errs = errors.contactos_extra?.[idx]
            return (
              <div
                key={field.id}
                className="rounded-xl border border-slate-200 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-700">
                    Contacto adicional {idx + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => extraArray.remove(idx)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="Relación familiar"
                    error={errs?.relacion?.message}
                  >
                    <select
                      className={inputCls}
                      defaultValue=""
                      {...register(`contactos_extra.${idx}.relacion` as const)}
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
                  <Field label="Teléfono" error={errs?.telefono?.message}>
                    <InputTelefono
                      name={`contactos_extra.${idx}.telefono` as const}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
              control={control as Control<any>}
                    />
                  </Field>
                </div>

                <Field label="Email" error={errs?.email?.message}>
                  <input
                    type="email"
                    inputMode="email"
                    className={inputCls}
                    {...register(`contactos_extra.${idx}.email` as const)}
                  />
                </Field>

                <Field
                  label="Mejor día para llamarle (marca uno o varios)"
                  error={errs?.dias_llamada?.message as string | undefined}
                >
                  {fechasLlamada.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Aún no hay fechas configuradas para esta edición.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {fechasLlamada.map((f) => (
                        <label
                          key={f}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            value={f}
                            {...register(
                              `contactos_extra.${idx}.dias_llamada` as const
                            )}
                          />
                          <span>{formatearFecha(f)}</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-2 cursor-pointer border-t border-slate-200 pt-1.5 mt-1">
                        <input
                          type="checkbox"
                          value="cualquiera"
                          {...register(
                            `contactos_extra.${idx}.dias_llamada` as const
                          )}
                        />
                        <span>Cualquier día</span>
                      </label>
                    </div>
                  )}
                </Field>
              </div>
            )
          })}

          {extraArray.fields.length < 2 && (
            <button
              type="button"
              onClick={() =>
                extraArray.append({
                  relacion: '' as never,
                  telefono: '',
                  email: '',
                  dias_llamada: [],
                })
              }
              className="w-full rounded-lg border border-dashed border-slate-300 text-slate-600 font-medium py-2.5 hover:bg-slate-50"
            >
              + Añadir contacto adicional
            </button>
          )}
        </div>
      </section>

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!onPrev}
          className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 hover:bg-slate-50 disabled:opacity-50"
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

// ----------------------------------------------------------------------------
// Sub-componentes / estilos
// ----------------------------------------------------------------------------

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
