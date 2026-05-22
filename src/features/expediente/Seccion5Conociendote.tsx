import { useState } from 'react'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CampusEdicion, Expediente } from './api'
import { useAutosave } from '../../lib/useAutosave'
import { IndicadorGuardado } from '../../components/ui/IndicadorGuardado'
import { ErrorBanner, MSG_FALTAN_RESPUESTAS } from '../../components/ui/ErrorBanner'

// ----------------------------------------------------------------------------
// Schema — todos los campos son opcionales (sección informativa, no bloquea)
// ----------------------------------------------------------------------------

const noSi = z.union([z.literal('no'), z.literal('si')], {
  error: 'Selecciona una opción',
})

const noSiTextoStrict = z
  .object({
    respuesta: noSi,
    detalle: z.string().optional(),
  })
  .refine(
    (v) => v.respuesta !== 'si' || (v.detalle?.trim().length ?? 0) > 0,
    { path: ['detalle'], message: 'Especifica' }
  )

// La música tiene tipo + artistas en lugar de detalle libre
const noSiMusica = z
  .object({
    respuesta: noSi,
    tipo: z.string().optional(),
    artistas: z.string().optional(),
  })
  .refine(
    (v) => v.respuesta !== 'si' || (v.tipo?.trim().length ?? 0) > 0,
    { path: ['tipo'], message: 'Indica qué tipo de música' }
  )

const schema = z.object({
  participante: z.object({
    sobrenombre: z.string().optional(),
    curso: z.string().optional(),
    actividades_deseadas: z.string().optional(),
    buen_monitor: z.string().optional(),
    amigo_de_ti: z.string().optional(),
    musica: noSiMusica,
    deportes: noSiTextoStrict,
    libros: z.string().optional(),
    comida: z.string().optional(),
    aficiones: z.string().optional(),
    instrumento: noSiTextoStrict,
    habitacion: z.union(
      [
        z.literal('ordenada'),
        z.literal('desordenada'),
        z.literal('depende'),
      ],
      { error: 'Selecciona una opción' }
    ),
    talento: noSiTextoStrict,
    profesion_sonada: z.string().optional(),
    empresa_favorita: z.string().optional(),
    emociona: z.string().optional(),
    dificil_no_tener: z.string().optional(),
    extra: z.string().optional(),
    // Solo se rellena si programa = 'emprendimiento' (validación abajo)
    emprendimiento: z.string().optional(),
  }),
  familia: z.object({
    deporte: noSiTextoStrict,
    aire_libre: noSiTextoStrict,
    arte: noSiTextoStrict,
    alimentacion_casa: z.string().optional(),
    social: z.union(
      [
        z.literal('sociable'),
        z.literal('timido'),
        z.literal('adaptable'),
        z.literal('grupos_pequenos'),
        z.literal('otro'),
      ],
      { error: 'Selecciona una opción' }
    ),
    social_otro: z.string().optional(),
    duerme: z.string().optional(),
    materia_preferida: z.string().optional(),
    temor: noSiTextoStrict,
    salud_fisica: noSiTextoStrict,
    salud_emocional: noSiTextoStrict,
    condicion_salud: noSiTextoStrict,
    familia_unica: z.string().optional(),
    emprendedor: noSiTextoStrict,
    dificil_ser_nino: z.string().optional(),
    tradicion_favorita: z.string().optional(),
    motivacion_campus: z.string().optional(),
    pregunta_equipo: noSiTextoStrict,
    dispositivos_electronicos: z.string().optional(),
    por_que_frp: z.string().optional(),
    extra: noSiTextoStrict,
    // Solo se rellena si programa = 'emprendimiento' (validación abajo)
    emprendimiento: z.string().optional(),
  }).refine(
    (v) => v.social !== 'otro' || (v.social_otro?.trim().length ?? 0) > 0,
    { path: ['social_otro'], message: 'Especifica' }
  ),
})

export type Seccion5Values = z.infer<typeof schema>

// ----------------------------------------------------------------------------
// Componente
// ----------------------------------------------------------------------------

type Props = {
  expediente: Expediente
  edicion: CampusEdicion | null
  onSave: (patch: {
    columnas: Partial<Expediente>
    respuestas: Partial<Seccion5Values>
  }) => Promise<void>
  onPrev: () => void
  onNext: () => Promise<void>
}

export function Seccion5Conociendote({
  expediente,
  onSave,
  onPrev,
  onNext,
}: Props) {
  const previo =
    (expediente.respuestas?.seccion5 as Partial<Seccion5Values> | undefined) ??
    {}

  const form = useForm<Seccion5Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      participante: {
        sobrenombre: previo.participante?.sobrenombre ?? '',
        curso: previo.participante?.curso ?? expediente.curso ?? '',
        actividades_deseadas: previo.participante?.actividades_deseadas ?? '',
        buen_monitor: previo.participante?.buen_monitor ?? '',
        amigo_de_ti: previo.participante?.amigo_de_ti ?? '',
        musica: previo.participante?.musica ?? {
          respuesta: undefined,
          tipo: '',
          artistas: '',
        },
        deportes: previo.participante?.deportes ?? emptyNoSi(),
        libros: previo.participante?.libros ?? '',
        comida: previo.participante?.comida ?? '',
        aficiones: previo.participante?.aficiones ?? '',
        instrumento: previo.participante?.instrumento ?? emptyNoSi(),
        habitacion: previo.participante?.habitacion,
        talento: previo.participante?.talento ?? emptyNoSi(),
        profesion_sonada: previo.participante?.profesion_sonada ?? '',
        empresa_favorita: previo.participante?.empresa_favorita ?? '',
        emociona: previo.participante?.emociona ?? '',
        dificil_no_tener: previo.participante?.dificil_no_tener ?? '',
        extra: previo.participante?.extra ?? '',
        emprendimiento: previo.participante?.emprendimiento ?? '',
      },
      familia: {
        deporte: previo.familia?.deporte ?? emptyNoSi(),
        aire_libre: previo.familia?.aire_libre ?? emptyNoSi(),
        arte: previo.familia?.arte ?? emptyNoSi(),
        alimentacion_casa: previo.familia?.alimentacion_casa ?? '',
        social: previo.familia?.social,
        social_otro: previo.familia?.social_otro ?? '',
        duerme: previo.familia?.duerme ?? '',
        materia_preferida: previo.familia?.materia_preferida ?? '',
        temor: previo.familia?.temor ?? emptyNoSi(),
        salud_fisica: previo.familia?.salud_fisica ?? emptyNoSi(),
        salud_emocional: previo.familia?.salud_emocional ?? emptyNoSi(),
        condicion_salud: previo.familia?.condicion_salud ?? emptyNoSi(),
        familia_unica: previo.familia?.familia_unica ?? '',
        emprendedor: previo.familia?.emprendedor ?? emptyNoSi(),
        dificil_ser_nino: previo.familia?.dificil_ser_nino ?? '',
        tradicion_favorita: previo.familia?.tradicion_favorita ?? '',
        motivacion_campus: previo.familia?.motivacion_campus ?? '',
        pregunta_equipo: previo.familia?.pregunta_equipo ?? emptyNoSi(),
        dispositivos_electronicos:
          previo.familia?.dispositivos_electronicos ?? '',
        por_que_frp: previo.familia?.por_que_frp ?? '',
        extra: previo.familia?.extra ?? emptyNoSi(),
        emprendimiento: previo.familia?.emprendimiento ?? '',
      },
    },
  })

  const esEmprendimiento = expediente.programa === 'emprendimiento'

  const { register, handleSubmit, watch, formState: { isSubmitting } } = form
  const values = watch()

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      await onSave({
        columnas: { curso: v.participante?.curso || null },
        respuestas: v,
      })
    },
  })

  const [submitError, setSubmitError] = useState<string | null>(null)
  const { setError } = form
  const onValid = async (v: Seccion5Values) => {
    // Validación manual: si es Emprendimiento, las 2 preguntas extra son
    // obligatorias.
    if (esEmprendimiento) {
      const faltaPart = !v.participante.emprendimiento?.trim()
      const faltaFam = !v.familia.emprendimiento?.trim()
      if (faltaPart || faltaFam) {
        if (faltaPart) {
          setError('participante.emprendimiento', {
            type: 'manual',
            message: 'Obligatorio',
          })
        }
        if (faltaFam) {
          setError('familia.emprendimiento', {
            type: 'manual',
            message: 'Obligatorio',
          })
        }
        setSubmitError(MSG_FALTAN_RESPUESTAS)
        return
      }
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
          <h2 className="text-xl font-semibold text-slate-900">¡Conociéndote!</h2>
          <p className="text-slate-600 text-sm mt-1">
            Estas preguntas nos ayudan a conocer mejor al/a la participante
            antes del Campus. Las contesta el tutor/a. Ninguna es obligatoria.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      {/* ===================== PARTICIPANTE ===================== */}
      <section className="space-y-6">
        <SeccionTitulo>Preguntas sobre el/la participante</SeccionTitulo>

        <Field label="Sobrenombre o nombre por el que le gusta que le llamen">
          <input type="text" className={inputCls} {...register('participante.sobrenombre')} />
        </Field>

        <Field label="Curso que hará en septiembre">
          <input type="text" className={inputCls} {...register('participante.curso')} placeholder="p.ej. 6º Primaria" />
        </Field>

        <Larga label="¿Qué actividades del Campus FRP le gustaría hacer?" name="participante.actividades_deseadas" register={register} />
        <Larga label="Para él/ella, ¿qué hace que un monitor sea un buen monitor?" name="participante.buen_monitor" register={register} />
        <Larga label="Si fuera otra persona, ¿por qué querría ser su amigo/a?" name="participante.amigo_de_ti" register={register} />

        <NoSiConExtras
          label="¿Escucha música?"
          name="participante.musica"
          watch={watch}
          register={register}
          extras={[
            { label: '¿Qué tipo?', name: 'participante.musica.tipo' },
            { label: 'Artistas favoritos', name: 'participante.musica.artistas' },
          ]}
        />

        <NoSiTexto label="¿Le gustan los deportes?" detailLabel="¿Cuáles?" name="participante.deportes" register={register} watch={watch} />

        <Larga label="¿Cuáles son sus libros favoritos?" name="participante.libros" register={register} />
        <Larga label="¿Cuál es su comida favorita?" name="participante.comida" register={register} />
        <Larga label="¿Qué aficiones tiene?" name="participante.aficiones" register={register} />

        <NoSiTexto label="¿Toca algún instrumento?" detailLabel="¿Cuál?" name="participante.instrumento" register={register} watch={watch} />

        <Field label="Su habitación suele estar">
          <RadioInline
            name="participante.habitacion"
            register={register}
            options={[
              { value: 'ordenada', label: 'Ordenada' },
              { value: 'desordenada', label: 'Desordenada' },
              { value: 'depende', label: 'Depende del día' },
            ]}
          />
        </Field>

        <NoSiTexto label="¿Tiene algún talento especial?" detailLabel="¿Cuál?" name="participante.talento" register={register} watch={watch} />

        <Larga label="¿Cuál es su profesión soñada?" name="participante.profesion_sonada" register={register} />
        <Larga label="¿Su empresa o empresario/a favorito/a?" name="participante.empresa_favorita" register={register} />
        <Larga label="¿Qué le vuelve loco/a o le emociona mucho?" name="participante.emociona" register={register} />
        <Larga label="Sin contar comida, abrigo o agua, ¿qué cosa sería muy difícil para él/ella no tener?" name="participante.dificil_no_tener" register={register} />
        <Larga label="Cuéntanos cualquier otra cosa sobre él/ella. ¡Lo que quieras!" name="participante.extra" register={register} rows={4} />

        {esEmprendimiento && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Si pudieras crear una empresa, producto o servicio nuevo, ¿qué sería y por qué crees que ayudaría a otras personas?
            </label>
            <textarea
              rows={4}
              className={inputCls}
              {...register('participante.emprendimiento')}
            />
            {form.formState.errors.participante?.emprendimiento?.message && (
              <p className="text-red-600 text-sm mt-1">
                {form.formState.errors.participante.emprendimiento.message as string}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ====================== FAMILIA ====================== */}
      <section className="space-y-6 border-t border-slate-200 pt-8">
        <SeccionTitulo>Preguntas para las familias</SeccionTitulo>

        <NoSiTexto label="¿Le gusta el deporte?" detailLabel="¿Cuál/es?" name="familia.deporte" register={register} watch={watch} />
        <NoSiTexto label="¿Le gustan las actividades al aire libre?" detailLabel="¿Cuál/es?" name="familia.aire_libre" register={register} watch={watch} />
        <NoSiTexto label="¿Le gusta el arte, la música o el teatro?" detailLabel="Especificar" name="familia.arte" register={register} watch={watch} />

        <Larga label="Describa sus hábitos alimentarios en casa" name="familia.alimentacion_casa" register={register} />

        <Field label="¿Cómo describiría a su hijo/a socialmente?">
          <RadioInline
            name="familia.social"
            register={register}
            options={[
              { value: 'sociable', label: 'Sociable' },
              { value: 'timido', label: 'Tímido/a' },
              { value: 'adaptable', label: 'Le cuesta al principio, pero se adapta' },
              { value: 'grupos_pequenos', label: 'Prefiere grupos pequeños' },
              { value: 'otro', label: 'Otro' },
            ]}
          />
          {watch('familia.social') === 'otro' && (
            <input
              type="text"
              className={`${inputCls} mt-2`}
              placeholder="Explicación"
              {...register('familia.social_otro')}
            />
          )}
        </Field>

        <Larga label="¿Cómo duerme su hijo/a habitualmente?" name="familia.duerme" register={register} />
        <Larga label="¿Cuál es su materia preferida en la escuela?" name="familia.materia_preferida" register={register} />

        <NoSiTexto label="¿Tiene algún temor que debamos conocer?" detailLabel="Especificar" name="familia.temor" register={register} watch={watch} />
        <NoSiTexto label="¿Algo sobre su salud física que debamos conocer?" detailLabel="Especificar" name="familia.salud_fisica" register={register} watch={watch} />
        <NoSiTexto label="¿Algo sobre su salud emocional que debamos conocer?" detailLabel="Especificar" name="familia.salud_emocional" register={register} watch={watch} />
        <NoSiTexto label="¿Alguna condición de salud que debamos tener en cuenta?" detailLabel="Especificar" name="familia.condicion_salud" register={register} watch={watch} />

        <Larga label="¿Qué hace única a vuestra familia?" name="familia.familia_unica" register={register} />

        <NoSiTexto label="¿Considera que existe espíritu emprendedor en vuestra familia?" detailLabel="Explique brevemente" name="familia.emprendedor" register={register} watch={watch} />

        <Larga label="¿Qué les parece lo más difícil de ser niño/a hoy?" name="familia.dificil_ser_nino" register={register} />
        <Larga label="¿Cuál es vuestra tradición familiar favorita?" name="familia.tradicion_favorita" register={register} />
        <Larga label="¿Qué les motiva de la participación de su hijo/a en el Campus?" name="familia.motivacion_campus" register={register} />

        <NoSiTexto label="¿Desean realizar alguna pregunta al equipo del Campus?" detailLabel="Escriba su pregunta" name="familia.pregunta_equipo" register={register} watch={watch} />

        <Larga label="¿Qué opinión tiene sobre el uso de dispositivos electrónicos por parte de su hijo/a?" name="familia.dispositivos_electronicos" register={register} />
        <Larga label="¿Por qué han elegido el Campus FRP?" name="familia.por_que_frp" register={register} />

        <NoSiTexto label="¿Hay cualquier otra cosa sobre su hijo/a que considere importante explicarnos?" detailLabel="Explíquelo" name="familia.extra" register={register} watch={watch} />

        {esEmprendimiento && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ¿Qué expectativas tenéis sobre lo que vuestro hijo/a viva o aprenda en este programa del Campus FRP?
            </label>
            <textarea
              rows={4}
              className={inputCls}
              {...register('familia.emprendimiento')}
            />
            {form.formState.errors.familia &&
              'emprendimiento' in form.formState.errors.familia &&
              (form.formState.errors.familia as { emprendimiento?: { message?: string } }).emprendimiento?.message && (
                <p className="text-red-600 text-sm mt-1">
                  {(form.formState.errors.familia as { emprendimiento?: { message?: string } }).emprendimiento!.message as string}
                </p>
              )}
          </div>
        )}
      </section>

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

function emptyNoSi() {
  return { respuesta: undefined, detalle: '' }
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

function SeccionTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-semibold text-slate-900 uppercase tracking-wide">
      {children}
    </h3>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function Larga({
  label,
  name,
  register,
  rows = 2,
}: {
  label: string
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  rows?: number
}) {
  return (
    <Field label={label}>
      <textarea rows={rows} className={inputCls} {...register(name)} />
    </Field>
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

function NoSiTexto({
  label,
  detailLabel = 'Especificar',
  name,
  register,
  watch,
}: {
  label: string
  detailLabel?: string
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: (n: string) => any
}) {
  const respuesta = watch(`${name}.respuesta`)
  return (
    <Field label={label}>
      <RadioNoSi name={`${name}.respuesta`} register={register} />
      {respuesta === 'si' && (
        <div className="mt-2">
          <label className="block text-sm text-slate-700 mb-1">{detailLabel}</label>
          <textarea
            rows={2}
            className={inputCls}
            {...register(`${name}.detalle`)}
          />
        </div>
      )}
    </Field>
  )
}

function NoSiConExtras({
  label,
  name,
  watch,
  register,
  extras,
}: {
  label: string
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: (n: string) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  extras: { label: string; name: string }[]
}) {
  const respuesta = watch(`${name}.respuesta`)
  return (
    <Field label={label}>
      <RadioNoSi name={`${name}.respuesta`} register={register} />
      {respuesta === 'si' && (
        <div className="mt-2 space-y-2">
          {extras.map((ex) => (
            <div key={ex.name}>
              <label className="block text-sm text-slate-700 mb-1">{ex.label}</label>
              <input type="text" className={inputCls} {...register(ex.name)} />
            </div>
          ))}
        </div>
      )}
    </Field>
  )
}
