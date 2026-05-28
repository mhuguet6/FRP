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
// Constantes — opciones predefinidas para los chips de "Mis gustos"
// ----------------------------------------------------------------------------

const MUSICA_OPTS = [
  'Pop',
  'Rock',
  'Rap / Hip-hop',
  'Electrónica',
  'Reggaetón',
  'Clásica',
  'K-pop',
  'No escucho música',
] as const

const DEPORTES_OPTS = [
  'Fútbol',
  'Baloncesto',
  'Natación',
  'Tenis',
  'Ciclismo',
  'Escalada',
  'Baile',
  'No me gustan los deportes',
] as const

const AFICIONES_OPTS = [
  'Dibujo / arte',
  'Gaming',
  'Lectura',
  'Cocina',
  'Fotografía',
  'Teatro',
  'Manualidades',
  'Magia',
] as const

const INSTRUMENTO_OPTS = [
  'Guitarra',
  'Piano',
  'Batería',
  'Violín',
  'Flauta',
  'No toco ninguno',
] as const

const COMIDA_OPTS = [
  'Pizza',
  'Pasta',
  'Sushi',
  'Hamburguesa',
  'Tacos',
  'Arroz',
  'Dulces',
] as const

const HABITACION_OPTS = [
  'muy_ordenada',
  'bastante_ordenada',
  'caotica',
  'desastre',
] as const

const HABITACION_LABEL: Record<(typeof HABITACION_OPTS)[number], string> = {
  muy_ordenada: 'Muy ordenada',
  bastante_ordenada: 'Bastante ordenada',
  caotica: 'Un poco caótica',
  desastre: 'Un desastre total',
}

// ----------------------------------------------------------------------------
// Schema — todo opcional excepto nombre/apellidos. Sección "del niño",
// informativa: no bloqueamos navegación por respuestas vacías.
// ----------------------------------------------------------------------------

const schema = z.object({
  nombre_apellidos: z.string().min(1, 'Obligatorio'),
  apodo: z.string().optional(),
  gustos: z.object({
    musica: z.array(z.string()),
    deportes: z.array(z.string()),
    aficiones: z.array(z.string()),
    instrumento: z.array(z.string()),
    comida: z.array(z.string()),
  }),
  sobre_mi: z.object({
    // Obligatorios:
    amigo_de_ti: z.string().min(1, 'Obligatorio'),
    profesion_sonada: z.string().min(1, 'Obligatorio'),
    te_vuelve_loco: z.string().min(1, 'Obligatorio'),
    habitacion: z.enum(
      [
        'muy_ordenada',
        'bastante_ordenada',
        'caotica',
        'desastre',
      ],
      { error: 'Selecciona una opción' }
    ),
    sin_que_no_puedes_vivir: z.string().min(1, 'Obligatorio'),
    // Opcionales (la familia/niño puede dejarlos en blanco):
    talento_especial: z.string().optional(),
    extra: z.string().optional(),
  }),
})

export type Seccion4Values = z.input<typeof schema>

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

export function Seccion4Medicacion({
  expediente,
  onSave,
  onPrev,
  onNext,
}: Props) {
  const previo =
    (expediente.respuestas?.seccion4 as Partial<Seccion4Values> | undefined) ??
    {}

  // Pre-relleno del nombre desde S1 (igual que en S7)
  const nombreSugerido = `${expediente.alumno_nombre ?? ''} ${
    expediente.alumno_apellidos ?? ''
  }`.trim()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Seccion4Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      nombre_apellidos: previo.nombre_apellidos ?? nombreSugerido,
      apodo: previo.apodo ?? '',
      gustos: {
        musica: previo.gustos?.musica ?? [],
        deportes: previo.gustos?.deportes ?? [],
        aficiones: previo.gustos?.aficiones ?? [],
        instrumento: previo.gustos?.instrumento ?? [],
        comida: previo.gustos?.comida ?? [],
      },
      sobre_mi: {
        amigo_de_ti: previo.sobre_mi?.amigo_de_ti ?? '',
        talento_especial: previo.sobre_mi?.talento_especial ?? '',
        profesion_sonada: previo.sobre_mi?.profesion_sonada ?? '',
        te_vuelve_loco: previo.sobre_mi?.te_vuelve_loco ?? '',
        habitacion:
          (previo.sobre_mi?.habitacion as Seccion4Values['sobre_mi']['habitacion']) ??
          (undefined as never),
        sin_que_no_puedes_vivir: previo.sobre_mi?.sin_que_no_puedes_vivir ?? '',
        extra: previo.sobre_mi?.extra ?? '',
      },
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
            Cuéntanos sobre ti
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Esta sección la rellenas tú, el/la participante. Cuéntanos cómo
            eres para que el equipo del Campus te conozca mejor.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      {/* Datos básicos */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label="Nombre y apellidos"
          requerido
          error={errors.nombre_apellidos?.message}
        >
          <input
            type="text"
            className={inputCls}
            {...register('nombre_apellidos')}
          />
        </Field>
        <Field label="Apodo (opcional)">
          <input
            type="text"
            placeholder="¿Cómo te llaman tus amigos?"
            className={inputCls}
            {...register('apodo')}
          />
        </Field>
      </div>

      {/* Mis gustos e intereses (desplegable) */}
      <details open className="rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900 text-sm">
          Mis gustos e intereses
        </summary>
        <div className="px-4 py-3 space-y-5 border-t border-slate-200">
          <ChipsCategoria
            label="Música"
            predefined={MUSICA_OPTS}
            value={watch('gustos.musica') ?? []}
            onChange={(v) =>
              setValue('gustos.musica', v, { shouldDirty: true })
            }
            addPlaceholder="Artista favorito o género propio…"
          />
          <ChipsCategoria
            label="Deportes"
            predefined={DEPORTES_OPTS}
            value={watch('gustos.deportes') ?? []}
            onChange={(v) =>
              setValue('gustos.deportes', v, { shouldDirty: true })
            }
            addPlaceholder="Otro deporte…"
          />
          <ChipsCategoria
            label="Aficiones"
            predefined={AFICIONES_OPTS}
            value={watch('gustos.aficiones') ?? []}
            onChange={(v) =>
              setValue('gustos.aficiones', v, { shouldDirty: true })
            }
            addPlaceholder="Otra afición…"
          />
          <ChipsCategoria
            label="Instrumento (opcional)"
            predefined={INSTRUMENTO_OPTS}
            value={watch('gustos.instrumento') ?? []}
            onChange={(v) =>
              setValue('gustos.instrumento', v, { shouldDirty: true })
            }
            addPlaceholder="Otro instrumento…"
          />
          <ChipsCategoria
            label="Comida favorita"
            predefined={COMIDA_OPTS}
            value={watch('gustos.comida') ?? []}
            onChange={(v) =>
              setValue('gustos.comida', v, { shouldDirty: true })
            }
            addPlaceholder="La tuya propia…"
          />
        </div>
      </details>

      {/* Sobre mí mismo/a (desplegable) */}
      <details className="rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900 text-sm">
          Sobre mí mismo/a
        </summary>
        <div className="px-4 py-3 space-y-4 border-t border-slate-200">
          <Field
            label="Si fueras otra persona, ¿por qué querrías ser amigo/a tuyo/a?"
            requerido
            error={errors.sobre_mi?.amigo_de_ti?.message}
          >
            <textarea
              rows={2}
              className={inputCls}
              {...register('sobre_mi.amigo_de_ti')}
            />
          </Field>
          <Field label="¿Tienes algún talento especial? (opcional)">
            <textarea
              rows={2}
              className={inputCls}
              {...register('sobre_mi.talento_especial')}
            />
          </Field>
          <Field
            label="¿Cuál es tu profesión soñada?"
            requerido
            error={errors.sobre_mi?.profesion_sonada?.message}
          >
            <input
              type="text"
              className={inputCls}
              {...register('sobre_mi.profesion_sonada')}
            />
          </Field>
          <Field
            label="¿Qué te vuelve loco/a?"
            requerido
            error={errors.sobre_mi?.te_vuelve_loco?.message}
          >
            <textarea
              rows={2}
              className={inputCls}
              {...register('sobre_mi.te_vuelve_loco')}
            />
          </Field>
          <Field
            label="Tu habitación, ¿está ordenada o desordenada?"
            requerido
            error={errors.sobre_mi?.habitacion?.message}
          >
            <select
              className={inputCls}
              defaultValue=""
              {...register('sobre_mi.habitacion')}
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {HABITACION_OPTS.map((o) => (
                <option key={o} value={o}>
                  {HABITACION_LABEL[o]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Excepto comida, agua o abrigo, ¿sin qué no puedes vivir?"
            requerido
            error={errors.sobre_mi?.sin_que_no_puedes_vivir?.message}
          >
            <textarea
              rows={2}
              className={inputCls}
              {...register('sobre_mi.sin_que_no_puedes_vivir')}
            />
          </Field>
          <Field label="Cuéntanos cualquier otra cosa sobre ti (opcional)">
            <textarea
              rows={3}
              className={inputCls}
              {...register('sobre_mi.extra')}
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
// Sub-componente: chips multi-select con opción de añadir personalizados
// ----------------------------------------------------------------------------

function ChipsCategoria({
  label,
  predefined,
  value,
  onChange,
  addPlaceholder,
}: {
  label: string
  predefined: readonly string[]
  value: string[]
  onChange: (v: string[]) => void
  addPlaceholder: string
}) {
  const [draft, setDraft] = useState('')
  const sel = new Set(value)

  const togglePredefined = (item: string) => {
    if (sel.has(item)) onChange(value.filter((v) => v !== item))
    else onChange([...value, item])
  }
  const addCustom = () => {
    const v = draft.trim()
    if (!v || sel.has(v)) {
      setDraft('')
      return
    }
    onChange([...value, v])
    setDraft('')
  }
  const removeCustom = (item: string) => {
    onChange(value.filter((v) => v !== item))
  }

  const customs = value.filter((v) => !predefined.includes(v))

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {predefined.map((p) => {
          const activo = sel.has(p)
          return (
            <button
              key={p}
              type="button"
              onClick={() => togglePredefined(p)}
              className={
                activo
                  ? 'rounded-full border px-3 py-1 text-sm bg-slate-900 text-white border-slate-900'
                  : 'rounded-full border px-3 py-1 text-sm bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }
            >
              {p}
            </button>
          )
        })}
        {customs.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => removeCustom(c)}
            className="rounded-full border px-3 py-1 text-sm bg-slate-900 text-white border-slate-900"
            title="Quitar"
          >
            {c} ×
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder={addPlaceholder}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <button
          type="button"
          onClick={addCustom}
          className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50 shrink-0"
        >
          + Añadir
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Sub-componentes UI
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
