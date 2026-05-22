import { useEffect, useState } from 'react'
import { useForm, type UseFormRegister, type UseFormWatch } from 'react-hook-form'
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

const noSiTexto = z
  .object({
    respuesta: noSi,
    detalle: z.string().optional(),
  })
  .refine(
    (v) => v.respuesta !== 'si' || (v.detalle?.trim().length ?? 0) > 0,
    { path: ['detalle'], message: 'Especifica' }
  )

const ANTECEDENTES_OPTS = [
  'Enfermedades respiratorias',
  'Accidentes relevantes',
  'Trastornos digestivos',
  'Enfermedades cutáneas',
  'Intervenciones quirúrgicas',
] as const

const PATOLOGIAS_OPTS = [
  'Anginas',
  'Resfriados frecuentes',
  'Faringitis',
  'Empachos',
  'Estreñimiento',
  'Dolor de oídos',
  'Sinusitis',
  'Reumatismo infantil',
  'Dolor de muelas o dientes',
  'Enuresis nocturna',
  'Insomnio',
] as const

const schema = z.object({
  situacion_familiar: noSiTexto,

  antecedentes_medicos: z
    .object({
      respuesta: noSi,
      tipos: z.array(z.string()),
      otras: z.string().optional(),
      comentarios: z.string().optional(),
    })
    .refine(
      (v) =>
        v.respuesta !== 'si' ||
        v.tipos.length > 0 ||
        (v.otras?.trim().length ?? 0) > 0 ||
        (v.comentarios?.trim().length ?? 0) > 0,
      { path: ['tipos'], message: 'Marca alguna opción o añade detalle' }
    ),

  alergias: z
    .object({
      respuesta: noSi,
      que: z.string().optional(),
      reaccion: z.string().optional(),
    })
    .refine(
      (v) => v.respuesta !== 'si' || (v.que?.trim().length ?? 0) > 0,
      { path: ['que'], message: 'Indica a qué' }
    ),

  mareos: noSiTexto,

  alimentacion: z.object({
    come: z.union(
      [
        z.literal('poco'),
        z.literal('normal'),
        z.literal('mucho'),
        z.literal('varia'),
      ],
      { error: 'Selecciona una opción' }
    ),
    dieta: noSiTexto,
    peso_kg: z.string().optional(),
  }),

  experiencia_colonias: z.object({
    veces: z.union(
      [z.literal('nunca'), z.literal('una_vez'), z.literal('varias_veces')],
      { error: 'Selecciona una opción' }
    ),
    comentarios: z.string().optional(),
  }),

  patologias: z
    .object({
      respuesta: noSi,
      tipos: z.array(z.string()),
      otros: z.string().optional(),
    })
    .refine(
      (v) =>
        v.respuesta !== 'si' ||
        v.tipos.length > 0 ||
        (v.otros?.trim().length ?? 0) > 0,
      { path: ['tipos'], message: 'Marca alguna opción' }
    ),

  covid: z.object({
    info: noSiTexto,
    dosis: z.string().optional(),
  }),

  discapacidad: noSiTexto,
  movilidad: noSiTexto,
  motricidad: noSiTexto,

  gafas_lentillas: noSiTexto,
  aparatos_bucales: noSiTexto,

  miedos: noSiTexto,
  caracter: noSiTexto,
  atencion_especial: noSiTexto,

  vacunacion: z.object({
    opcion: z.union([z.literal('1'), z.literal('2')], {
      error: 'Selecciona una opción',
    }),
    // Opción 1: declaración (firma se hace en sección 7)
    declaro_vacunas: z.boolean().optional(),
    // Opción 2: archivo subido (path)
    certificado_path: z.string().nullable().optional(),
  }),
})

export type Seccion3Values = z.infer<typeof schema>

// ----------------------------------------------------------------------------
// Componente
// ----------------------------------------------------------------------------

type Props = {
  expediente: Expediente
  edicion: CampusEdicion | null
  onSave: (patch: {
    columnas: Partial<Expediente>
    respuestas: Partial<Seccion3Values>
  }) => Promise<void>
  onPrev: () => void
  onNext: () => Promise<void>
}

export function Seccion3Salud({ expediente, onSave, onPrev, onNext }: Props) {
  const previo =
    (expediente.respuestas?.seccion3 as Partial<Seccion3Values> | undefined) ??
    {}

  const form = useForm<Seccion3Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: defaultsFromPrevio(previo, expediente),
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form

  const values = watch()

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      await onSave({
        columnas: {
          tiene_alergias:
            v.alergias?.respuesta === 'si'
              ? true
              : v.alergias?.respuesta === 'no'
                ? false
                : null,
          detalle_alergias:
            v.alergias?.respuesta === 'si' ? v.alergias?.que ?? null : null,
        },
        respuestas: v,
      })
    },
  })

  useEffect(() => {
    // Si seleccionan opción 2 y no han subido nada todavía, no hacemos nada.
    // Si seleccionan opción 1, limpiamos certificado anterior si lo había.
    if (values.vacunacion?.opcion === '1' && values.vacunacion?.certificado_path) {
      setValue('vacunacion.certificado_path', null)
    }
  }, [values.vacunacion?.opcion, values.vacunacion?.certificado_path, setValue])

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
          <h2 className="text-xl font-semibold text-slate-900">Salud</h2>
          <p className="text-slate-600 text-sm mt-1">
            Información médica del/de la participante. Marca No si no hay nada
            especial que declarar.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      <NoSiBloque
        name="situacion_familiar"
        label="Situación familiar relevante"
        question="¿Hay alguna situación familiar que sea importante que conozcan los monitores?"
        register={register}
        watch={watch}
        error={(errors.situacion_familiar as { detalle?: { message?: string } })?.detalle?.message}
      />

      <Bloque>
        <Titulo>Antecedentes médicos relevantes</Titulo>
        <Pregunta>
          ¿El/la participante tiene o ha tenido alguna condición médica
          relevante que debamos conocer?
        </Pregunta>
        <RadioNoSi name="antecedentes_medicos.respuesta" register={register} />
        {watch('antecedentes_medicos.respuesta') === 'si' && (
          <>
            <CheckboxList
              name="antecedentes_medicos.tipos"
              options={ANTECEDENTES_OPTS}
              register={register}
            />
            <Field label="Otras enfermedades">
              <input
                type="text"
                className={inputCls}
                {...register('antecedentes_medicos.otras')}
              />
            </Field>
            <Field label="Comentarios médicos adicionales">
              <textarea
                rows={2}
                className={inputCls}
                {...register('antecedentes_medicos.comentarios')}
              />
            </Field>
            {(errors.antecedentes_medicos as { tipos?: { message?: string } })?.tipos?.message && (
              <p className="text-red-600 text-sm">
                {(errors.antecedentes_medicos as { tipos?: { message?: string } })?.tipos?.message}
              </p>
            )}
          </>
        )}
        {(errors.antecedentes_medicos as { respuesta?: { message?: string } })?.respuesta?.message && (
          <p className="text-red-600 text-sm">
            {(errors.antecedentes_medicos as { respuesta?: { message?: string } })?.respuesta?.message}
          </p>
        )}
      </Bloque>

      <Bloque>
        <Titulo>Alergias</Titulo>
        <Pregunta>¿El/la participante tiene alguna alergia conocida?</Pregunta>
        <RadioNoSi name="alergias.respuesta" register={register} />
        {watch('alergias.respuesta') === 'si' && (
          <>
            <Field
              label="¿A qué?"
              error={(errors.alergias as { que?: { message?: string } })?.que?.message}
            >
              <input
                type="text"
                className={inputCls}
                {...register('alergias.que')}
              />
            </Field>
            <Field label="Tipo de reacción o gravedad, si se conoce">
              <textarea
                rows={2}
                className={inputCls}
                {...register('alergias.reaccion')}
              />
            </Field>
          </>
        )}
        {(errors.alergias as { respuesta?: { message?: string } })?.respuesta?.message && (
          <p className="text-red-600 text-sm">
            {(errors.alergias as { respuesta?: { message?: string } })?.respuesta?.message}
          </p>
        )}
      </Bloque>

      <NoSiBloque
        name="mareos"
        label="Mareos"
        question="¿El/la participante se marea con facilidad?"
        detailLabel="¿Cuándo o en qué situaciones?"
        register={register}
        watch={watch}
        error={(errors.mareos as { detalle?: { message?: string } })?.detalle?.message}
      />

      <Bloque>
        <Titulo>Alimentación</Titulo>
        <Pregunta>Con relación a su edad, el/la participante come:</Pregunta>
        <RadioInline
          name="alimentacion.come"
          options={[
            { value: 'poco', label: 'Poco' },
            { value: 'normal', label: 'Normal' },
            { value: 'mucho', label: 'Mucho' },
            { value: 'varia', label: 'Varía / depende' },
          ]}
          register={register}
        />
        {(errors.alimentacion as { come?: { message?: string } })?.come?.message && (
          <p className="text-red-600 text-sm">
            {(errors.alimentacion as { come?: { message?: string } })?.come?.message}
          </p>
        )}

        <Pregunta>
          ¿Sigue alguna dieta especial o tiene restricción alimentaria?
        </Pregunta>
        <RadioNoSi name="alimentacion.dieta.respuesta" register={register} />
        {watch('alimentacion.dieta.respuesta') === 'si' && (
          <Field
            label="Especificar"
            error={
              (errors.alimentacion as { dieta?: { detalle?: { message?: string } } })
                ?.dieta?.detalle?.message
            }
          >
            <textarea
              rows={2}
              className={inputCls}
              {...register('alimentacion.dieta.detalle')}
            />
          </Field>
        )}

        <Field label="Peso habitual aproximado (kg)">
          <InputNumerico
            name="alimentacion.peso_kg"
            register={register}
            permitirDecimal
            placeholder="p.ej. 35.5"
          />
        </Field>
      </Bloque>

      <Bloque>
        <Titulo>Experiencia previa en colonias o campamentos</Titulo>
        <Pregunta>¿Cuántas veces ha ido de colonias o campamento?</Pregunta>
        <RadioInline
          name="experiencia_colonias.veces"
          options={[
            { value: 'nunca', label: 'Nunca' },
            { value: 'una_vez', label: 'Una vez' },
            { value: 'varias_veces', label: 'Varias veces' },
          ]}
          register={register}
        />
        {(errors.experiencia_colonias as { veces?: { message?: string } })?.veces?.message && (
          <p className="text-red-600 text-sm">
            {(errors.experiencia_colonias as { veces?: { message?: string } })?.veces?.message}
          </p>
        )}
        <Field label="Comentarios (opcional)">
          <textarea
            rows={2}
            className={inputCls}
            {...register('experiencia_colonias.comentarios')}
          />
        </Field>
      </Bloque>

      <Bloque>
        <Titulo>Patologías o molestias frecuentes</Titulo>
        <Pregunta>
          ¿El/la participante sufre alguna patología, molestia o situación
          recurrente que debamos tener en cuenta?
        </Pregunta>
        <RadioNoSi name="patologias.respuesta" register={register} />
        {watch('patologias.respuesta') === 'si' && (
          <>
            <CheckboxList
              name="patologias.tipos"
              options={PATOLOGIAS_OPTS}
              register={register}
            />
            <Field label="Otros">
              <input
                type="text"
                className={inputCls}
                {...register('patologias.otros')}
              />
            </Field>
            {(errors.patologias as { tipos?: { message?: string } })?.tipos?.message && (
              <p className="text-red-600 text-sm">
                {(errors.patologias as { tipos?: { message?: string } })?.tipos?.message}
              </p>
            )}
          </>
        )}
      </Bloque>

      <Bloque>
        <Titulo>COVID-19</Titulo>
        <Pregunta>
          ¿Hay alguna información relevante relacionada con COVID-19 que debamos
          conocer?
        </Pregunta>
        <RadioNoSi name="covid.info.respuesta" register={register} />
        {watch('covid.info.respuesta') === 'si' && (
          <Field
            label="Especificar"
            error={(errors.covid as { info?: { detalle?: { message?: string } } })?.info?.detalle?.message}
          >
            <textarea
              rows={2}
              className={inputCls}
              {...register('covid.info.detalle')}
            />
          </Field>
        )}
        <Field label="Si está vacunado/a, número de dosis (opcional)">
          <InputNumerico
            name="covid.dosis"
            register={register}
            placeholder="0, 1, 2…"
          />
        </Field>
      </Bloque>

      <NoSiBloque
        name="discapacidad"
        label="Discapacidad"
        question="¿El/la participante tiene alguna discapacidad que debamos conocer?"
        detailLabel="Tipo y apoyo necesario"
        register={register}
        watch={watch}
        error={(errors.discapacidad as { detalle?: { message?: string } })?.detalle?.message}
      />

      <NoSiBloque
        name="movilidad"
        label="Movilidad"
        question="¿Tiene algún problema de movilidad?"
        register={register}
        watch={watch}
        error={(errors.movilidad as { detalle?: { message?: string } })?.detalle?.message}
      />

      <NoSiBloque
        name="motricidad"
        label="Motricidad"
        question="¿Tiene alguna dificultad motriz?"
        register={register}
        watch={watch}
        error={(errors.motricidad as { detalle?: { message?: string } })?.detalle?.message}
      />

      <NoSiBloque
        name="gafas_lentillas"
        label="Gafas o lentillas"
        question="¿El/la participante lleva gafas o lentillas?"
        register={register}
        watch={watch}
        error={(errors.gafas_lentillas as { detalle?: { message?: string } })?.detalle?.message}
      />

      <NoSiBloque
        name="aparatos_bucales"
        label="Aparatos bucales"
        question="¿El/la participante lleva aparatos bucales?"
        register={register}
        watch={watch}
        error={(errors.aparatos_bucales as { detalle?: { message?: string } })?.detalle?.message}
      />

      <NoSiBloque
        name="miedos"
        label="Miedos o inseguridades"
        question="¿Tiene miedo a algo en especial que debamos conocer?"
        register={register}
        watch={watch}
        error={(errors.miedos as { detalle?: { message?: string } })?.detalle?.message}
      />

      <NoSiBloque
        name="caracter"
        label="Carácter y convivencia"
        question="¿Hay alguna característica de su carácter que debamos tener en cuenta para ayudarle mejor durante el Campus?"
        register={register}
        watch={watch}
        error={(errors.caracter as { detalle?: { message?: string } })?.detalle?.message}
      />

      <NoSiBloque
        name="atencion_especial"
        label="Atención especial"
        question="¿Necesita alguna atención especial durante el Campus?"
        detailLabel="Motivo y tipo de atención necesaria"
        register={register}
        watch={watch}
        error={(errors.atencion_especial as { detalle?: { message?: string } })?.detalle?.message}
      />

      <Bloque>
        <Titulo>Vacunación</Titulo>
        <Pregunta>Selecciona una de las dos opciones:</Pregunta>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
            <input
              type="radio"
              value="1"
              className="mt-1"
              {...register('vacunacion.opcion')}
            />
            <div>
              <div className="font-medium text-slate-900">
                Tengo la cartilla de vacunación
              </div>
              <div className="text-sm text-slate-600 mt-0.5">
                Firmarás la declaración al final del formulario.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
            <input
              type="radio"
              value="2"
              className="mt-1"
              {...register('vacunacion.opcion')}
            />
            <div className="flex-1">
              <div className="font-medium text-slate-900">
                Aporto certificado médico
              </div>
              <div className="text-sm text-slate-600 mt-0.5">
                Sube una foto o PDF del certificado del médico.
              </div>
              {watch('vacunacion.opcion') === '2' && (
                <div className="mt-3">
                  <FileUpload
                    expedienteId={expediente.id}
                    carpeta="vacunacion"
                    path={watch('vacunacion.certificado_path') ?? null}
                    onChange={(path) =>
                      setValue('vacunacion.certificado_path', path, {
                        shouldDirty: true,
                      })
                    }
                    emptyLabel="+ Subir certificado (foto o PDF)"
                  />
                </div>
              )}
            </div>
          </label>
        </div>
        {(errors.vacunacion as { opcion?: { message?: string } })?.opcion?.message && (
          <p className="text-red-600 text-sm">
            {(errors.vacunacion as { opcion?: { message?: string } })?.opcion?.message}
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
// Helpers
// ----------------------------------------------------------------------------

function defaultsFromPrevio(
  previo: Partial<Seccion3Values>,
  expediente: Expediente
): Seccion3Values {
  // Prefill alergias.respuesta desde la columna `tiene_alergias` si existe
  // y no hay valor en previo (consistencia con sección 1 / backoffice).
  const alergiasRespuesta =
    previo.alergias?.respuesta ??
    (expediente.tiene_alergias === true
      ? ('si' as const)
      : expediente.tiene_alergias === false
        ? ('no' as const)
        : (undefined as unknown as 'no'))

  return {
    situacion_familiar: previo.situacion_familiar ?? emptyNoSi(),
    antecedentes_medicos: previo.antecedentes_medicos ?? {
      respuesta: undefined as unknown as 'no',
      tipos: [],
      otras: '',
      comentarios: '',
    },
    alergias: {
      respuesta: alergiasRespuesta,
      que: previo.alergias?.que ?? expediente.detalle_alergias ?? '',
      reaccion: previo.alergias?.reaccion ?? '',
    },
    mareos: previo.mareos ?? emptyNoSi(),
    alimentacion: previo.alimentacion ?? {
      come: undefined as unknown as 'normal',
      dieta: emptyNoSi(),
      peso_kg: '',
    },
    experiencia_colonias: previo.experiencia_colonias ?? {
      veces: undefined as unknown as 'nunca',
      comentarios: '',
    },
    patologias: previo.patologias ?? {
      respuesta: undefined as unknown as 'no',
      tipos: [],
      otros: '',
    },
    covid: previo.covid ?? {
      info: emptyNoSi(),
      dosis: '',
    },
    discapacidad: previo.discapacidad ?? emptyNoSi(),
    movilidad: previo.movilidad ?? emptyNoSi(),
    motricidad: previo.motricidad ?? emptyNoSi(),
    gafas_lentillas: previo.gafas_lentillas ?? emptyNoSi(),
    aparatos_bucales: previo.aparatos_bucales ?? emptyNoSi(),
    miedos: previo.miedos ?? emptyNoSi(),
    caracter: previo.caracter ?? emptyNoSi(),
    atencion_especial: previo.atencion_especial ?? emptyNoSi(),
    vacunacion: previo.vacunacion ?? {
      opcion: undefined as unknown as '1',
      declaro_vacunas: false,
      certificado_path: null,
    },
  }
}

function emptyNoSi() {
  return {
    respuesta: undefined as unknown as 'no',
    detalle: '',
  }
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
  return (
    <h3 className="text-base font-semibold text-slate-900">{children}</h3>
  )
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

function RadioInline({
  name,
  options,
  register,
}: {
  name: string
  options: ReadonlyArray<{ value: string; label: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 cursor-pointer">
          <input type="radio" value={o.value} {...register(name)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  )
}

function CheckboxList({
  name,
  options,
  register,
}: {
  name: string
  options: readonly string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" value={o} {...register(name)} />
          <span className="text-sm">{o}</span>
        </label>
      ))}
    </div>
  )
}

function NoSiBloque({
  name,
  label,
  question,
  detailLabel = 'Especificar',
  register,
  watch,
  error,
}: {
  name: string
  label: string
  question: string
  detailLabel?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  watch: UseFormWatch<Seccion3Values>
  error?: string
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respuesta = watch(`${name}.respuesta` as any)
  return (
    <Bloque>
      <Titulo>{label}</Titulo>
      <Pregunta>{question}</Pregunta>
      <RadioNoSi name={`${name}.respuesta`} register={register} />
      {respuesta === 'si' && (
        <Field label={detailLabel} error={error}>
          <textarea
            rows={2}
            className={inputCls}
            {...register(`${name}.detalle`)}
          />
        </Field>
      )}
    </Bloque>
  )
}

// Input que solo permite dígitos (y opcionalmente un punto/coma decimal).
function InputNumerico({
  name,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register,
  permitirDecimal,
  placeholder,
}: {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  permitirDecimal?: boolean
  placeholder?: string
}) {
  const reg = register(name) as {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => void
    ref: React.Ref<HTMLInputElement>
    name: string
  }
  const cleanFn = permitirDecimal
    ? (s: string) => {
        // Solo dígitos + un único punto. La coma se convierte a punto.
        const trans = s.replace(/,/g, '.').replace(/[^\d.]/g, '')
        const partes = trans.split('.')
        return partes.length > 2
          ? partes[0] + '.' + partes.slice(1).join('')
          : trans
      }
    : (s: string) => s.replace(/\D/g, '')
  return (
    <input
      type="text"
      inputMode={permitirDecimal ? 'decimal' : 'numeric'}
      pattern={permitirDecimal ? '[0-9.]*' : '[0-9]*'}
      placeholder={placeholder}
      className={inputCls}
      name={reg.name}
      ref={reg.ref}
      onBlur={reg.onBlur}
      onChange={(e) => {
        const limpio = cleanFn(e.target.value)
        if (e.target.value !== limpio) e.target.value = limpio
        reg.onChange(e)
      }}
    />
  )
}
