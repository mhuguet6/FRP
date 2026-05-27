import { useEffect, useState } from 'react'
import {
  useFieldArray,
  useForm,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CampusEdicion, Expediente } from './api'
import { useAutosave } from '../../lib/useAutosave'
import { IndicadorGuardado } from '../../components/ui/IndicadorGuardado'
import { ErrorBanner, MSG_FALTAN_RESPUESTAS } from '../../components/ui/ErrorBanner'
import { FileUpload } from './FileUpload'

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

const noSi = z.union([z.literal('no'), z.literal('si')], {
  error: 'Selecciona una opción',
})

// Schema base de medicamento — todos los campos opcionales en zod.
// La obligatoriedad de nombre/dosis/horario solo aplica si la familia
// indicó "Sí" a la pregunta correspondiente (se valida en `superRefine` más
// abajo). Esto evita que residuos del array (medicamento auto-añadido al
// marcar Sí) bloqueen el envío si después la familia rectifica a "No".
//
// `horarios` es un array de "HH:00" (horas enteras 07:00–22:00).
// `prn` indica administración según necesidad (sin horario fijo).
// Compatibilidad: aceptamos `frecuencia` (string libre) en lectura por si
// hubiera datos antiguos pre-cambio, pero la UI ya no lo escribe.
const medItem = z.object({
  nombre: z.string().optional(),
  dosis: z.string().optional(),
  horarios: z.array(z.string()).optional(),
  prn: z.boolean().optional(),
  frecuencia: z.string().optional(),
  indicaciones: z.string().optional(),
})

const schema = z
  .object({
    habitual: z.object({
      respuesta: noSi,
      medicamentos: z.array(medItem),
    }),
    durante_campus: z.object({
      respuesta: noSi,
      medicamentos: z.array(medItem),
      receta_adjunta: z
        .union([z.literal('si'), z.literal('no')])
        .optional(),
      receta_path: z.string().nullable().optional(),
    }),
  })
  .superRefine((v, ctx) => {
    // Medicación habitual: si Sí → al menos un medicamento con nombre.
    if (v.habitual.respuesta === 'si') {
      if (v.habitual.medicamentos.length === 0) {
        ctx.addIssue({
          path: ['habitual', 'medicamentos'],
          code: z.ZodIssueCode.custom,
          message: 'Añade al menos un medicamento',
        })
      }
      v.habitual.medicamentos.forEach((m, i) => {
        if (!m.nombre?.trim()) {
          ctx.addIssue({
            path: ['habitual', 'medicamentos', i, 'nombre'],
            code: z.ZodIssueCode.custom,
            message: 'Obligatorio',
          })
        }
      })
    }

    // Medicación durante Campus: si Sí → al menos un medicamento con
    // nombre + dosis + (al menos una hora marcada o "según necesidad").
    if (v.durante_campus.respuesta === 'si') {
      if (v.durante_campus.medicamentos.length === 0) {
        ctx.addIssue({
          path: ['durante_campus', 'medicamentos'],
          code: z.ZodIssueCode.custom,
          message: 'Añade al menos un medicamento',
        })
      }
      v.durante_campus.medicamentos.forEach((m, i) => {
        if (!m.nombre?.trim()) {
          ctx.addIssue({
            path: ['durante_campus', 'medicamentos', i, 'nombre'],
            code: z.ZodIssueCode.custom,
            message: 'Obligatorio',
          })
        }
        if (!m.dosis?.trim()) {
          ctx.addIssue({
            path: ['durante_campus', 'medicamentos', i, 'dosis'],
            code: z.ZodIssueCode.custom,
            message: 'Obligatorio',
          })
        }
        const tieneHoras = (m.horarios ?? []).length > 0
        if (!tieneHoras && !m.prn) {
          ctx.addIssue({
            path: ['durante_campus', 'medicamentos', i, 'horarios'],
            code: z.ZodIssueCode.custom,
            message: 'Marca al menos una hora o "según necesidad"',
          })
        }
      })
    }
  })

export type Seccion4Values = z.infer<typeof schema>

// ----------------------------------------------------------------------------
// Componente
// ----------------------------------------------------------------------------

type Props = {
  expediente: Expediente
  edicion: CampusEdicion | null
  onSave: (patch: {
    columnas: Partial<Expediente>
    respuestas: Partial<Seccion4Values>
  }) => Promise<void>
  onPrev: () => void
  onNext: () => Promise<void>
}

export function Seccion4Medicacion({
  expediente,
  onSave,
  onPrev,
  onNext,
}: Props) {
  const previo =
    (expediente.respuestas?.seccion4 as Partial<Seccion4Values> | undefined) ??
    {}

  const form = useForm<Seccion4Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      habitual: {
        respuesta: previo.habitual?.respuesta ?? (undefined as unknown as 'no'),
        medicamentos: previo.habitual?.medicamentos ?? [],
      },
      durante_campus: {
        respuesta:
          previo.durante_campus?.respuesta ??
          (expediente.tiene_medicacion === true
            ? ('si' as const)
            : expediente.tiene_medicacion === false
              ? ('no' as const)
              : (undefined as unknown as 'no')),
        medicamentos: previo.durante_campus?.medicamentos ?? [],
        receta_adjunta: previo.durante_campus?.receta_adjunta,
        receta_path: previo.durante_campus?.receta_path ?? null,
      },
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

  const habitualArray = useFieldArray({ control, name: 'habitual.medicamentos' })
  const campusArray = useFieldArray({ control, name: 'durante_campus.medicamentos' })

  const habitualResp = watch('habitual.respuesta')
  const campusResp = watch('durante_campus.respuesta')
  const recetaCampus = watch('durante_campus.receta_adjunta')

  // Auto-append una fila vacía al marcar "Sí" si no hay ninguna.
  // Al pasar a "No" vaciamos el array para que no queden residuos vacíos
  // que despisten al usuario y a la validación.
  useEffect(() => {
    if (habitualResp === 'si' && habitualArray.fields.length === 0) {
      habitualArray.append({ nombre: '', dosis: '', horarios: [], prn: false })
    } else if (habitualResp === 'no' && habitualArray.fields.length > 0) {
      // Solo limpia si TODO el array está vacío (no pisamos datos genuinos)
      const todoVacio = habitualArray.fields.every((_, i) => {
        const m = values.habitual?.medicamentos?.[i]
        return (
          !m?.nombre?.trim() &&
          !m?.dosis?.trim() &&
          (m?.horarios ?? []).length === 0 &&
          !m?.prn
        )
      })
      if (todoVacio) {
        for (let i = habitualArray.fields.length - 1; i >= 0; i--) {
          habitualArray.remove(i)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitualResp])

  useEffect(() => {
    if (campusResp === 'si' && campusArray.fields.length === 0) {
      campusArray.append({
        nombre: '',
        dosis: '',
        horarios: [],
        prn: false,
        indicaciones: '',
      })
    } else if (campusResp === 'no' && campusArray.fields.length > 0) {
      const todoVacio = campusArray.fields.every((_, i) => {
        const m = values.durante_campus?.medicamentos?.[i]
        return (
          !m?.nombre?.trim() &&
          !m?.dosis?.trim() &&
          (m?.horarios ?? []).length === 0 &&
          !m?.prn
        )
      })
      if (todoVacio) {
        for (let i = campusArray.fields.length - 1; i >= 0; i--) {
          campusArray.remove(i)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusResp])

  const values = watch()

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      await onSave({
        columnas: {
          tiene_medicacion:
            v.durante_campus?.respuesta === 'si'
              ? true
              : v.durante_campus?.respuesta === 'no'
                ? false
                : null,
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

  return (
    <form
      onSubmit={handleSubmit(onValid, onInvalid)}
      className="bg-white rounded-2xl border border-slate-200 p-6 space-y-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Medicación</h2>
          <p className="text-slate-600 text-sm mt-1">
            Indica si toma medicación habitualmente y si necesitará tomar
            alguna durante el Campus.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      {/* --------------------------- Habitual --------------------------- */}
      <Bloque>
        <Titulo>Medicación habitual</Titulo>
        <Pregunta>¿El/la participante toma medicación actualmente?</Pregunta>
        <RadioNoSi name="habitual.respuesta" register={register} />

        {habitualResp === 'si' && (
          <ListaMedicamentos
            fields={habitualArray.fields}
            onRemove={habitualArray.remove}
            onAppend={() =>
              habitualArray.append({
                nombre: '',
                dosis: '',
                horarios: [],
                prn: false,
              })
            }
            register={register}
            watch={watch}
            setValue={setValue}
            prefix="habitual.medicamentos"
            errors={errors}
            variante="habitual"
          />
        )}
        {(errors.habitual as { respuesta?: { message?: string } })?.respuesta?.message && (
          <p className="text-red-600 text-sm">
            {(errors.habitual as { respuesta?: { message?: string } })?.respuesta?.message}
          </p>
        )}
      </Bloque>

      {/* ------------------------ Durante Campus ------------------------ */}
      <Bloque>
        <Titulo>Medicación durante el Campus</Titulo>
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">
          Sin la autorización firmada y la receta médica adjunta, no se podrá
          suministrar medicación al participante durante el Campus.
        </p>
        <Pregunta>
          ¿El/la participante necesita tomar medicación durante el Campus?
        </Pregunta>
        <RadioNoSi name="durante_campus.respuesta" register={register} />

        {campusResp === 'si' && (
          <>
            <ListaMedicamentos
              fields={campusArray.fields}
              onRemove={campusArray.remove}
              onAppend={() =>
                campusArray.append({
                  nombre: '',
                  dosis: '',
                  horarios: [],
                  prn: false,
                  indicaciones: '',
                })
              }
              register={register}
              watch={watch}
              setValue={setValue}
              prefix="durante_campus.medicamentos"
              errors={errors}
              variante="campus"
            />

            <Field
              label="¿Se adjunta receta médica?"
              error={
                (errors.durante_campus as { receta_adjunta?: { message?: string } })
                  ?.receta_adjunta?.message
              }
            >
              <select
                className={inputCls}
                defaultValue=""
                {...register('durante_campus.receta_adjunta')}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </Field>

            {recetaCampus === 'si' && (
              <Field label="Adjunta la receta (foto o PDF)">
                <FileUpload
                  expedienteId={expediente.id}
                  carpeta="receta"
                  path={watch('durante_campus.receta_path') ?? null}
                  onChange={(path) =>
                    setValue('durante_campus.receta_path', path, {
                      shouldDirty: true,
                    })
                  }
                  emptyLabel="+ Subir receta (foto o PDF)"
                />
              </Field>
            )}

            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
              Al final del formulario tendrás que firmar la autorización para
              suministrar la medicación durante el Campus.
            </div>
          </>
        )}
        {(errors.durante_campus as { respuesta?: { message?: string } })?.respuesta?.message && (
          <p className="text-red-600 text-sm">
            {(errors.durante_campus as { respuesta?: { message?: string } })?.respuesta?.message}
          </p>
        )}
      </Bloque>

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      <div className="flex justify-between gap-3 pt-2 border-t border-slate-200">
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

// ----------------------------------------------------------------------------
// Sub-componentes
// ----------------------------------------------------------------------------

function ListaMedicamentos({
  fields,
  onRemove,
  onAppend,
  register,
  watch,
  setValue,
  prefix,
  errors,
  variante,
}: {
  fields: { id: string }[]
  onRemove: (idx: number) => void
  onAppend: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: UseFormWatch<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>
  prefix: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any
  variante: 'habitual' | 'campus'
}) {
  const arrErrors =
    prefix === 'habitual.medicamentos'
      ? errors?.habitual?.medicamentos
      : errors?.durante_campus?.medicamentos
  const arrMsg = arrErrors?.message

  return (
    <div className="space-y-3">
      {fields.map((field, idx) => {
        const itemError = Array.isArray(arrErrors) ? arrErrors[idx] : undefined
        return (
          <div
            key={field.id}
            className="rounded-xl border border-slate-200 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">
                Medicamento {idx + 1}
              </div>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Quitar
                </button>
              )}
            </div>

            <Field label="Nombre" error={itemError?.nombre?.message}>
              <input
                type="text"
                className={inputCls}
                {...register(`${prefix}.${idx}.nombre`)}
              />
            </Field>
            <Field label="Dosis" error={itemError?.dosis?.message}>
              <input
                type="text"
                className={inputCls}
                placeholder={variante === 'campus' ? 'p.ej. 1 comprimido' : 'opcional'}
                {...register(`${prefix}.${idx}.dosis`)}
              />
            </Field>
            <Field
              label={
                variante === 'campus'
                  ? 'Horario de administración'
                  : 'Horario (opcional)'
              }
              error={itemError?.horarios?.message}
            >
              <SelectorHorario
                horarios={
                  (watch(`${prefix}.${idx}.horarios`) as string[] | undefined) ??
                  []
                }
                prn={
                  (watch(`${prefix}.${idx}.prn`) as boolean | undefined) ?? false
                }
                onChangeHorarios={(h) =>
                  setValue(`${prefix}.${idx}.horarios`, h, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                onChangePrn={(v) =>
                  setValue(`${prefix}.${idx}.prn`, v, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </Field>
            {variante === 'campus' && (
              <Field label="Indicaciones importantes (opcional)">
                <textarea
                  rows={2}
                  className={inputCls}
                  {...register(`${prefix}.${idx}.indicaciones`)}
                />
              </Field>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={onAppend}
        className="w-full rounded-lg border border-dashed border-slate-300 text-slate-600 font-medium py-2.5 hover:bg-slate-50"
      >
        + Añadir otro medicamento
      </button>

      {arrMsg && <p className="text-red-600 text-sm">{arrMsg}</p>}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

function Bloque({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
      {children}
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-slate-900">{children}</h3>
}

function Pregunta({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-700">{children}</p>
}

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

// Horas enteras 07:00–22:00.
const HORAS_DISPONIBLES: string[] = Array.from({ length: 16 }, (_, i) =>
  `${String(7 + i).padStart(2, '0')}:00`
)

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RadioNoSi({ name, register }: { name: string; register: UseFormRegister<any> }) {
  return (
    <div className="flex gap-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="radio" value="no" {...register(name)} />
        <span>No</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="radio" value="si" {...register(name)} />
        <span>Sí</span>
      </label>
    </div>
  )
}

