import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CampusEdicion, Expediente } from './api'
import { useAutosave } from '../../lib/useAutosave'
import { IndicadorGuardado } from '../../components/ui/IndicadorGuardado'
import {
  ErrorBanner,
  MSG_FALTAN_RESPUESTAS,
} from '../../components/ui/ErrorBanner'

// ----------------------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------------------

const DUERME_OPTS = [
  'muy_bien',
  'bien_general',
  'cuesta_conciliar',
  'interrupciones',
  'mal',
] as const
const DUERME_LABEL: Record<(typeof DUERME_OPTS)[number], string> = {
  muy_bien: 'Muy bien',
  bien_general: 'Bien en general',
  cuesta_conciliar: 'Le cuesta conciliar el sueño',
  interrupciones: 'Tiene interrupciones frecuentes',
  mal: 'Mal, suele dormir poco',
}

const SALUD_FISICA_OPTS = [
  'excelente',
  'buena',
  'regular',
  'delicada',
] as const
const SALUD_FISICA_LABEL: Record<(typeof SALUD_FISICA_OPTS)[number], string> = {
  excelente: 'Excelente',
  buena: 'Buena',
  regular: 'Regular',
  delicada: 'Delicada',
}

const SALUD_EMOCIONAL_OPTS = [
  'muy_estable',
  'estable',
  'altibajos',
  'apoyo_frecuente',
] as const
const SALUD_EMOCIONAL_LABEL: Record<
  (typeof SALUD_EMOCIONAL_OPTS)[number],
  string
> = {
  muy_estable: 'Muy estable',
  estable: 'Estable',
  altibajos: 'Tiene altibajos',
  apoyo_frecuente: 'Necesita apoyo frecuente',
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

const schema = z.object({
  // Perfil personal
  perfil_social: z.string().min(1, 'Obligatorio'),
  duerme: z.enum(DUERME_OPTS, { error: 'Selecciona una opción' }),
  aficiones: z.string().min(1, 'Obligatorio'),
  // Salud y bienestar
  salud_fisica: z.enum(SALUD_FISICA_OPTS, {
    error: 'Selecciona una opción',
  }),
  salud_emocional: z.enum(SALUD_EMOCIONAL_OPTS, {
    error: 'Selecciona una opción',
  }),
  salud_adicional: z.string().min(1, 'Obligatorio'),
  // Uso de pantallas (todo opcional)
  uso_pantallas: z.string().optional(),
  // Vuestra elección (todo opcional)
  por_que_frp: z.string().optional(),
  cualquier_otra_cosa: z.string().optional(),
  pregunta_equipo: z.string().optional(),
})

export type Seccion5Values = z.input<typeof schema>

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

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Seccion5Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      perfil_social: previo.perfil_social ?? '',
      duerme: previo.duerme ?? (undefined as never),
      aficiones: previo.aficiones ?? '',
      salud_fisica: previo.salud_fisica ?? (undefined as never),
      salud_emocional: previo.salud_emocional ?? (undefined as never),
      salud_adicional: previo.salud_adicional ?? '',
      uso_pantallas: previo.uso_pantallas ?? '',
      por_que_frp: previo.por_que_frp ?? '',
      cualquier_otra_cosa: previo.cualquier_otra_cosa ?? '',
      pregunta_equipo: previo.pregunta_equipo ?? '',
    },
  })

  const values = watch()

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      await onSave({
        columnas: {},
        respuestas: v as Record<string, unknown>,
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
      className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Cuéntanos sobre vuestro hijo/a
            <span className="block text-xs font-normal text-slate-500 mt-1">
              (las familias pueden saltarse este paso · 5 mins)
            </span>
          </h2>
          <p className="text-slate-600 text-sm mt-2">
            Esta sección la rellenan los padres o tutores. El equipo se la lee
            antes de empezar el Campus.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      {/* ▸ Perfil personal */}
      <details open className="rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900 text-sm">
          Perfil personal
        </summary>
        <div className="px-4 py-3 space-y-4 border-t border-slate-200">
          <Field
            label="¿Es social o tímido/a? Descríbelo"
            requerido
            error={errors.perfil_social?.message}
          >
            <textarea
              rows={3}
              className={inputCls}
              {...register('perfil_social')}
            />
          </Field>
          <Field
            label="¿Cómo duerme?"
            requerido
            error={errors.duerme?.message}
          >
            <select
              className={inputCls}
              defaultValue=""
              {...register('duerme')}
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {DUERME_OPTS.map((o) => (
                <option key={o} value={o}>
                  {DUERME_LABEL[o]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="¿Qué aficiones tiene?"
            requerido
            error={errors.aficiones?.message}
          >
            <textarea
              rows={2}
              className={inputCls}
              {...register('aficiones')}
            />
          </Field>
        </div>
      </details>

      {/* ▸ Salud y bienestar */}
      <details className="rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900 text-sm">
          Salud y bienestar
        </summary>
        <div className="px-4 py-3 space-y-4 border-t border-slate-200">
          <Field
            label="¿Cómo describirías su salud física?"
            requerido
            error={errors.salud_fisica?.message}
          >
            <select
              className={inputCls}
              defaultValue=""
              {...register('salud_fisica')}
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {SALUD_FISICA_OPTS.map((o) => (
                <option key={o} value={o}>
                  {SALUD_FISICA_LABEL[o]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="¿Cómo describirías su salud emocional?"
            requerido
            error={errors.salud_emocional?.message}
          >
            <select
              className={inputCls}
              defaultValue=""
              {...register('salud_emocional')}
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {SALUD_EMOCIONAL_OPTS.map((o) => (
                <option key={o} value={o}>
                  {SALUD_EMOCIONAL_LABEL[o]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="¿Alguna condición de salud adicional que debamos tener en cuenta?"
            requerido
            error={errors.salud_adicional?.message}
          >
            <textarea
              rows={3}
              className={inputCls}
              {...register('salud_adicional')}
            />
          </Field>
        </div>
      </details>

      {/* ▸ Uso de pantallas (todo opcional) */}
      <details className="rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900 text-sm">
          Uso de pantallas
          <span className="ml-2 text-xs text-slate-500 font-normal">
            (opcional)
          </span>
        </summary>
        <div className="px-4 py-3 space-y-4 border-t border-slate-200">
          <Field label="¿Qué opinión tenéis sobre el uso de dispositivos electrónicos?">
            <textarea
              rows={3}
              className={inputCls}
              {...register('uso_pantallas')}
            />
          </Field>
        </div>
      </details>

      {/* ▸ Vuestra elección (todo opcional) */}
      <details className="rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900 text-sm">
          Vuestra elección
          <span className="ml-2 text-xs text-slate-500 font-normal">
            (opcional)
          </span>
        </summary>
        <div className="px-4 py-3 space-y-4 border-t border-slate-200">
          <Field label="¿Por qué habéis elegido el Campus FRP?">
            <textarea
              rows={3}
              className={inputCls}
              {...register('por_que_frp')}
            />
          </Field>
          <Field label="Cualquier otra cosa que debamos saber">
            <textarea
              rows={3}
              placeholder="Cuéntanos cualquier aspecto que consideres oportuno para velar por el bienestar de tu hijo/a."
              className={inputCls}
              {...register('cualquier_otra_cosa')}
            />
          </Field>
          <Field label="¿Tenéis alguna pregunta para el equipo?">
            <textarea
              rows={2}
              className={inputCls}
              {...register('pregunta_equipo')}
            />
          </Field>
        </div>
      </details>

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

// ----------------------------------------------------------------------------
// Sub-componentes
// ----------------------------------------------------------------------------

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

function Field({
  label,
  error,
  requerido,
  children,
}: {
  label: string
  error?: string
  requerido?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {requerido && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  )
}
