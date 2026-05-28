import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CampusEdicion, Expediente } from './api'
import { useAutosave } from '../../lib/useAutosave'
import { IndicadorGuardado } from '../../components/ui/IndicadorGuardado'
import {
  ErrorBanner,
  MSG_FALTAN_RESPUESTAS,
} from '../../components/ui/ErrorBanner'
import { SelectorHorario } from './SelectorHorario'

// ----------------------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------------------

const ANTECEDENTES_OPTIONS = [
  'Enfermedades respiratorias',
  'Trastornos digestivos',
  'Enfermedades cutáneas',
  'Accidentes o lesiones relevantes',
  'Intervenciones quirúrgicas',
  'Otra',
] as const

const SINTOMAS_OPTIONS = [
  'Anginas',
  'Faringitis',
  'Dolor de oídos',
  'Sinusitis',
  'Enuresis nocturna',
  'Insomnio',
  'Resfriados frecuentes',
  'Estreñimiento',
  'Empachos',
  'Reumatismo infantil',
  'Dolor dental',
  'Otra',
] as const

const COME_OPTIONS = ['mucho', 'normal', 'poco'] as const
const CAMPAMENTOS_OPTIONS = ['ninguna', '1', '2-3', 'mas-de-3'] as const

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

const noSi = z.union([z.literal('no'), z.literal('si')], {
  error: 'Selecciona una opción',
})

const medItem = z.object({
  nombre: z.string().optional(),
  dosis: z.string().optional(),
  horarios: z.array(z.string()).optional(),
  prn: z.boolean().optional(),
  instrucciones: z.string().optional(),
})

const schema = z
  .object({
    // 1. Alergias — dos categorías para que cocinero y médico filtren limpio
    alergias: z.object({
      respuesta: noSi,
      alimenticias: z.string().optional(),
      otras: z.string().optional(),
      // `que` se mantiene en el schema para leer datos antiguos (pre-refactor).
      // Nunca se escribe desde aquí; lo respeta el PDF como fallback.
      que: z.string().optional(),
    }),
    // 2. Medicación
    medicacion: z.object({
      respuesta: noSi,
      medicamentos: z.array(medItem),
    }),
    // 3. Mareos
    mareos: noSi,
    // 4. Limitaciones con el agua / natación
    limitacion_agua: noSi,
    limitacion_agua_detalle: z.string().optional(),
    // 5. Condiciones de salud relevantes — Antecedentes (multi)
    antecedentes: z.array(z.enum(ANTECEDENTES_OPTIONS)),
    antecedentes_otra: z.string().optional(),
    // 5b. Condiciones de salud relevantes — Síntomas habituales (multi)
    sintomas: z.array(z.enum(SINTOMAS_OPTIONS)),
    sintomas_otra: z.string().optional(),
    // 6. Movilidad y autonomía
    discapacidad: noSi,
    discapacidad_detalle: z.string().optional(),
    problemas_movilidad: noSi,
    problemas_movilidad_detalle: z.string().optional(),
    gafas_lentillas: noSi,
    aparatos_bucales: noSi,
    peso_kg: z
      .string()
      .optional()
      .refine(
        (v) => !v || /^\d+([.,]\d+)?$/.test(v.trim()),
        'Solo números (puedes usar coma o punto decimal)'
      ),
    // 7. Dieta especial
    dieta: z.object({
      respuesta: noSi,
      detalle: z.string().optional(),
    }),
    // 8. Come
    come: z.enum(COME_OPTIONS, { error: 'Selecciona una opción' }),
    // 9. Veces en campamentos
    veces_campamentos: z.enum(CAMPAMENTOS_OPTIONS, {
      error: 'Selecciona una opción',
    }),
    // 10. Cuestión familiar relevante
    cuestion_familiar: z.object({
      respuesta: noSi,
      detalle: z.string().optional(),
    }),
    // 11. Miedos (opcional — texto libre, sin validación)
    miedos: z.string().optional(),
    // 12. Observaciones generales (opcional — texto libre, sin validación)
    observaciones: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.alergias.respuesta === 'si') {
      const tieneAlimenticias = !!v.alergias.alimenticias?.trim()
      const tieneOtras = !!v.alergias.otras?.trim()
      if (!tieneAlimenticias && !tieneOtras) {
        ctx.addIssue({
          path: ['alergias', 'alimenticias'],
          code: z.ZodIssueCode.custom,
          message: 'Indica al menos una alergia (alimenticia u otra)',
        })
      }
    }
    if (v.medicacion.respuesta === 'si') {
      if (v.medicacion.medicamentos.length === 0) {
        ctx.addIssue({
          path: ['medicacion', 'medicamentos'],
          code: z.ZodIssueCode.custom,
          message: 'Añade al menos un medicamento',
        })
      }
      v.medicacion.medicamentos.forEach((m, i) => {
        if (!m.nombre?.trim() || !m.dosis?.trim()) {
          ctx.addIssue({
            path: ['medicacion', 'medicamentos', i, 'nombre'],
            code: z.ZodIssueCode.custom,
            message: 'Completa nombre y dosis',
          })
        }
        const tieneHoras = (m.horarios ?? []).length > 0
        if (!tieneHoras && !m.prn) {
          ctx.addIssue({
            path: ['medicacion', 'medicamentos', i, 'horarios'],
            code: z.ZodIssueCode.custom,
            message: 'Marca al menos una hora o "según necesidad"',
          })
        }
      })
    }
    if (
      v.antecedentes.includes('Otra') &&
      !v.antecedentes_otra?.trim()
    ) {
      ctx.addIssue({
        path: ['antecedentes_otra'],
        code: z.ZodIssueCode.custom,
        message: 'Especifica la otra condición',
      })
    }
    if (
      v.sintomas.includes('Otra') &&
      !v.sintomas_otra?.trim()
    ) {
      ctx.addIssue({
        path: ['sintomas_otra'],
        code: z.ZodIssueCode.custom,
        message: 'Especifica el otro síntoma',
      })
    }
    if (v.discapacidad === 'si' && !v.discapacidad_detalle?.trim()) {
      ctx.addIssue({
        path: ['discapacidad_detalle'],
        code: z.ZodIssueCode.custom,
        message: 'Indica qué discapacidad',
      })
    }
    if (
      v.problemas_movilidad === 'si' &&
      !v.problemas_movilidad_detalle?.trim()
    ) {
      ctx.addIssue({
        path: ['problemas_movilidad_detalle'],
        code: z.ZodIssueCode.custom,
        message: 'Indica qué problema de movilidad',
      })
    }
    if (
      v.limitacion_agua === 'si' &&
      !v.limitacion_agua_detalle?.trim()
    ) {
      ctx.addIssue({
        path: ['limitacion_agua_detalle'],
        code: z.ZodIssueCode.custom,
        message: 'Describe la limitación o miedo',
      })
    }
    if (v.dieta.respuesta === 'si' && !v.dieta.detalle?.trim()) {
      ctx.addIssue({
        path: ['dieta', 'detalle'],
        code: z.ZodIssueCode.custom,
        message: 'Describe la dieta',
      })
    }
    if (
      v.cuestion_familiar.respuesta === 'si' &&
      !v.cuestion_familiar.detalle?.trim()
    ) {
      ctx.addIssue({
        path: ['cuestion_familiar', 'detalle'],
        code: z.ZodIssueCode.custom,
        message: 'Describe la cuestión',
      })
    }
  })

export type Seccion2Values = z.input<typeof schema>

// ----------------------------------------------------------------------------
// Etiquetas
// ----------------------------------------------------------------------------

const COME_LABEL: Record<(typeof COME_OPTIONS)[number], string> = {
  mucho: 'Mucho',
  normal: 'Normal',
  poco: 'Poco',
}

const CAMPAMENTOS_LABEL: Record<(typeof CAMPAMENTOS_OPTIONS)[number], string> = {
  ninguna: 'Ninguna — es la primera vez',
  '1': '1 vez',
  '2-3': '2-3 veces',
  'mas-de-3': 'Más de 3 veces',
}

// ----------------------------------------------------------------------------
// Componente
// ----------------------------------------------------------------------------

type Props = {
  expediente: Expediente
  edicion: CampusEdicion | null
  authEmail?: string | null
  onSave: (patch: {
    columnas: Partial<Expediente>
    respuestas: Record<string, unknown>
  }) => Promise<void>
  onPrev: () => void
  onNext: () => Promise<void>
}

export function Seccion2Familia({
  expediente,
  onSave,
  onPrev,
  onNext,
}: Props) {
  const previo =
    (expediente.respuestas?.seccion2 as Partial<Seccion2Values> | undefined) ??
    {}

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
      alergias: {
        respuesta:
          (previo.alergias?.respuesta as 'no' | 'si' | undefined) ??
          (undefined as never),
        alimenticias:
          previo.alergias?.alimenticias ??
          // Compat con datos antiguos: si solo existía `que`, lo cargamos como
          // alimenticias por defecto y la familia puede mover lo que aplique.
          (previo.alergias as { que?: string } | undefined)?.que ??
          '',
        otras: previo.alergias?.otras ?? '',
        que: (previo.alergias as { que?: string } | undefined)?.que ?? '',
      },
      medicacion: previo.medicacion ?? {
        respuesta: undefined as never,
        medicamentos: [],
      },
      mareos: previo.mareos ?? (undefined as never),
      limitacion_agua:
        previo.limitacion_agua ??
        // Migración: si la familia ya marcó sabe_nadar=no en el formato
        // anterior, lo trasladamos a limitacion_agua=si (porque "no saber
        // nadar" es ahora una limitación).
        ((previo as { sabe_nadar?: 'si' | 'no' }).sabe_nadar === 'no'
          ? 'si'
          : (previo as { sabe_nadar?: 'si' | 'no' }).sabe_nadar === 'si'
            ? 'no'
            : (undefined as never)),
      limitacion_agua_detalle:
        previo.limitacion_agua_detalle ??
        ((previo as { sabe_nadar?: 'si' | 'no' }).sabe_nadar === 'no'
          ? 'No sabe nadar.'
          : ''),
      antecedentes: previo.antecedentes ?? [],
      antecedentes_otra: previo.antecedentes_otra ?? '',
      sintomas: previo.sintomas ?? [],
      sintomas_otra: previo.sintomas_otra ?? '',
      discapacidad: previo.discapacidad ?? (undefined as never),
      discapacidad_detalle: previo.discapacidad_detalle ?? '',
      problemas_movilidad_detalle: previo.problemas_movilidad_detalle ?? '',
      problemas_movilidad:
        previo.problemas_movilidad ?? (undefined as never),
      gafas_lentillas: previo.gafas_lentillas ?? (undefined as never),
      aparatos_bucales: previo.aparatos_bucales ?? (undefined as never),
      peso_kg: previo.peso_kg ?? '',
      dieta: previo.dieta ?? { respuesta: undefined as never, detalle: '' },
      come: previo.come ?? (undefined as never),
      veces_campamentos: previo.veces_campamentos ?? (undefined as never),
      cuestion_familiar:
        previo.cuestion_familiar ?? { respuesta: undefined as never, detalle: '' },
      miedos: previo.miedos ?? '',
      observaciones: previo.observaciones ?? '',
    },
  })

  const medArray = useFieldArray({ control, name: 'medicacion.medicamentos' })

  const values = watch()
  const alergiasResp = watch('alergias.respuesta')
  const medicacionResp = watch('medicacion.respuesta')
  const dietaResp = watch('dieta.respuesta')
  const cuestionResp = watch('cuestion_familiar.respuesta')
  const antecedentesSel = watch('antecedentes') ?? []
  const sintomasSel = watch('sintomas') ?? []
  const discapacidadResp = watch('discapacidad')
  const movilidadResp = watch('problemas_movilidad')

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
          // La columna `detalle_alergias` denormaliza ambas categorías
          // separadas por "; " para queries / fallback rápido en el listado.
          detalle_alergias:
            v.alergias?.respuesta === 'si'
              ? [v.alergias?.alimenticias, v.alergias?.otras]
                  .map((s) => s?.trim())
                  .filter(Boolean)
                  .join('; ') || null
              : null,
          tiene_medicacion:
            v.medicacion?.respuesta === 'si'
              ? true
              : v.medicacion?.respuesta === 'no'
                ? false
                : null,
        },
        respuestas: v as Record<string, unknown>,
      })
    },
  })

  // Auto-añadir UN medicamento vacío al marcar Sí (en useEffect para evitar
  // doble append en StrictMode/re-renders).
  useEffect(() => {
    if (medicacionResp === 'si' && medArray.fields.length === 0) {
      medArray.append({
        nombre: '',
        dosis: '',
        horarios: [],
        prn: false,
        instrucciones: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicacionResp])

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
          <h2 className="text-xl font-semibold text-slate-900">
            Salud y bienestar
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Información médica relevante para el equipo del Campus.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      {/* 1. Alergias — alimenticias + otras (separadas para cocinero y médico) */}
      <Bloque>
        <Pregunta requerido>¿Tiene alergias?</Pregunta>
        <RadioNoSi name="alergias.respuesta" register={register} />
        {getError(errors, 'alergias.respuesta') && (
          <p className="text-red-600 text-sm">
            {getError(errors, 'alergias.respuesta')}
          </p>
        )}
        {alergiasResp === 'si' && (
          <div className="space-y-3 mt-2">
            <p className="text-xs text-slate-500">
              Rellena las categorías que apliquen. Si una no aplica, déjala en
              blanco. Necesitamos al menos una.
            </p>
            <Field
              label="Alergias alimenticias"
              error={getError(errors, 'alergias.alimenticias')}
            >
              <textarea
                rows={2}
                placeholder="Ej: gluten, lactosa, frutos secos, marisco…"
                className={inputCls}
                {...register('alergias.alimenticias')}
              />
              <p className="text-xs text-slate-500 mt-1">
                Esto lo verá el equipo de cocina.
              </p>
            </Field>
            <Field
              label="Otras alergias"
              error={getError(errors, 'alergias.otras')}
            >
              <textarea
                rows={2}
                placeholder="Ambientales, medicamentos, contacto… Ej: polen, ácaros, penicilina, látex."
                className={inputCls}
                {...register('alergias.otras')}
              />
              <p className="text-xs text-slate-500 mt-1">
                Esto lo verá el equipo médico.
              </p>
            </Field>
          </div>
        )}
      </Bloque>

      {/* 2. Medicación */}
      <Bloque>
        <Pregunta requerido>¿Toma alguna medicación?</Pregunta>
        <RadioNoSi
          name="medicacion.respuesta"
          register={register}
          opciones={[
            { value: 'no', label: 'No toma ninguna medicación' },
            { value: 'si', label: 'Sí' },
          ]}
        />
        {medicacionResp === 'si' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Indica la medicación periódica que deba tomar y/o aquella puntual
              que pueda necesitar en el caso de que el equipo del Campus
              consulte a la familia por alguna dolencia habitual del/la
              participante.
            </p>
            {medArray.fields.map((field, idx) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const itemErr = (errors.medicacion as any)?.medicamentos?.[idx]
              return (
                <div
                  key={field.id}
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
                  <Field label="Medicación" error={itemErr?.nombre?.message}>
                    <input
                      type="text"
                      className={inputCls}
                      {...register(`medicacion.medicamentos.${idx}.nombre`)}
                    />
                  </Field>
                  <Field label="Dosis">
                    <input
                      type="text"
                      placeholder="p. ej. 1 comprimido"
                      className={inputCls}
                      {...register(`medicacion.medicamentos.${idx}.dosis`)}
                    />
                  </Field>
                  <Field
                    label="Horario de administración"
                    error={itemErr?.horarios?.message}
                  >
                    <SelectorHorario
                      horarios={
                        (watch(
                          `medicacion.medicamentos.${idx}.horarios`
                        ) as string[] | undefined) ?? []
                      }
                      prn={
                        (watch(
                          `medicacion.medicamentos.${idx}.prn`
                        ) as boolean | undefined) ?? false
                      }
                      onChangeHorarios={(h) =>
                        setValue(
                          `medicacion.medicamentos.${idx}.horarios`,
                          h,
                          { shouldDirty: true, shouldValidate: true }
                        )
                      }
                      onChangePrn={(v) =>
                        setValue(
                          `medicacion.medicamentos.${idx}.prn`,
                          v,
                          { shouldDirty: true, shouldValidate: true }
                        )
                      }
                    />
                  </Field>
                  <Field label="Instrucciones para los monitores (opcional)">
                    <textarea
                      rows={2}
                      className={inputCls}
                      {...register(
                        `medicacion.medicamentos.${idx}.instrucciones`
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
                  instrucciones: '',
                })
              }
              className="w-full rounded-lg border border-dashed border-slate-300 text-slate-600 font-medium py-2.5 hover:bg-slate-50"
            >
              + Añadir otro medicamento
            </button>
          </div>
        )}
      </Bloque>

      {/* 3. Mareos */}
      <Bloque>
        <Pregunta requerido>¿Se marea con facilidad?</Pregunta>
        <RadioNoSi
          name="mareos"
          register={register}
          opciones={[
            { value: 'no', label: 'No' },
            { value: 'si', label: 'Sí' },
          ]}
        />
        {getError(errors, 'mareos') && (
          <p className="text-red-600 text-sm">{getError(errors, 'mareos')}</p>
        )}
      </Bloque>

      {/* 4. Limitaciones o miedos con el agua */}
      <Bloque>
        <Pregunta requerido>
          ¿Tiene alguna limitación o miedo con el agua o la natación?
        </Pregunta>
        <RadioNoSi name="limitacion_agua" register={register} />
        {getError(errors, 'limitacion_agua') && (
          <p className="text-red-600 text-sm">
            {getError(errors, 'limitacion_agua')}
          </p>
        )}
        {watch('limitacion_agua') === 'si' && (
          <Field
            label="Describe la limitación o miedo"
            requerido
            error={getError(errors, 'limitacion_agua_detalle')}
          >
            <textarea
              rows={2}
              className={inputCls}
              placeholder="Ej: no sabe nadar, miedo al agua, mala experiencia previa, solo nada con flotador…"
              {...register('limitacion_agua_detalle')}
            />
          </Field>
        )}
      </Bloque>

      {/* 5. Condiciones de salud relevantes (desplegable) */}
      <details open className="rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900 text-sm">
          Condiciones de salud relevantes
        </summary>
        <div className="px-4 py-3 space-y-5 border-t border-slate-200">
          <div>
            <Pregunta>Antecedentes (puedes marcar varios)</Pregunta>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {ANTECEDENTES_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    value={opt}
                    {...register('antecedentes')}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {antecedentesSel.includes('Otra') && (
              <Field
                label="Especifica la otra condición"
                error={getError(errors, 'antecedentes_otra')}
              >
                <input
                  type="text"
                  className={inputCls}
                  {...register('antecedentes_otra')}
                />
              </Field>
            )}
          </div>

          <div>
            <Pregunta>Síntomas habituales (puedes marcar varios)</Pregunta>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {SINTOMAS_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    value={opt}
                    {...register('sintomas')}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {sintomasSel.includes('Otra') && (
              <Field
                label="Especifica el otro síntoma"
                error={getError(errors, 'sintomas_otra')}
              >
                <input
                  type="text"
                  className={inputCls}
                  {...register('sintomas_otra')}
                />
              </Field>
            )}
          </div>
        </div>
      </details>

      {/* 6. Movilidad y autonomía (desplegable abierto — contiene obligatorios) */}
      <details open className="rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-900 text-sm">
          Movilidad y autonomía
        </summary>
        <div className="px-4 py-3 space-y-5 border-t border-slate-200">
          <BloqueNoSiSimple
            label="¿Tiene alguna discapacidad?"
            name="discapacidad"
            register={register}
            error={getError(errors, 'discapacidad')}
            requerido
          />
          {discapacidadResp === 'si' && (
            <Field
              label="Indica cuál"
              requerido
              error={getError(errors, 'discapacidad_detalle')}
            >
              <textarea
                rows={2}
                className={inputCls}
                placeholder="Describe brevemente el tipo de discapacidad y cualquier apoyo que pueda necesitar."
                {...register('discapacidad_detalle')}
              />
            </Field>
          )}
          <BloqueNoSiSimple
            label="¿Problemas de movilidad?"
            name="problemas_movilidad"
            register={register}
            error={getError(errors, 'problemas_movilidad')}
            requerido
          />
          {movilidadResp === 'si' && (
            <Field
              label="Indica cuál"
              requerido
              error={getError(errors, 'problemas_movilidad_detalle')}
            >
              <textarea
                rows={2}
                className={inputCls}
                placeholder="Describe brevemente el problema de movilidad y cualquier apoyo que pueda necesitar."
                {...register('problemas_movilidad_detalle')}
              />
            </Field>
          )}
          <BloqueNoSiSimple
            label="¿Lleva gafas o lentillas?"
            name="gafas_lentillas"
            register={register}
            error={getError(errors, 'gafas_lentillas')}
            requerido
          />
          <BloqueNoSiSimple
            label="¿Lleva aparatos bucales?"
            name="aparatos_bucales"
            register={register}
            error={getError(errors, 'aparatos_bucales')}
            requerido
          />
          <Field label="Peso aproximado (kg)" error={getError(errors, 'peso_kg')}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="p. ej. 38"
              className={inputCls}
              {...register('peso_kg')}
            />
          </Field>
        </div>
      </details>

      {/* 7. Dieta */}
      <Bloque>
        <Pregunta requerido>¿Sigue alguna dieta especial?</Pregunta>
        <RadioNoSi
          name="dieta.respuesta"
          register={register}
          opciones={[
            { value: 'no', label: 'No, come de todo' },
            { value: 'si', label: 'Sí' },
          ]}
        />
        {dietaResp === 'si' && (
          <Field label="Describe la dieta" error={getError(errors, 'dieta.detalle')}>
            <textarea rows={2} className={inputCls} {...register('dieta.detalle')} />
          </Field>
        )}
      </Bloque>

      {/* 8. Come */}
      <Bloque>
        <Pregunta requerido>En relación a su edad, come</Pregunta>
        <select
          className={inputCls}
          defaultValue=""
          {...register('come')}
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {COME_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {COME_LABEL[o]}
            </option>
          ))}
        </select>
        {getError(errors, 'come') && (
          <p className="text-red-600 text-sm">{getError(errors, 'come')}</p>
        )}
      </Bloque>

      {/* 9. Veces en campamentos */}
      <Bloque>
        <Pregunta requerido>Veces que ha ido a campamentos</Pregunta>
        <select
          className={inputCls}
          defaultValue=""
          {...register('veces_campamentos')}
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {CAMPAMENTOS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {CAMPAMENTOS_LABEL[o]}
            </option>
          ))}
        </select>
        {getError(errors, 'veces_campamentos') && (
          <p className="text-red-600 text-sm">
            {getError(errors, 'veces_campamentos')}
          </p>
        )}
      </Bloque>

      {/* 10. Cuestión familiar relevante */}
      <Bloque>
        <Pregunta requerido>
          ¿Hay alguna cuestión familiar relevante para el equipo?
        </Pregunta>
        <RadioNoSi name="cuestion_familiar.respuesta" register={register} />
        {cuestionResp === 'si' && (
          <Field
            label="Describe la cuestión"
            error={getError(errors, 'cuestion_familiar.detalle')}
          >
            <textarea
              rows={3}
              className={inputCls}
              {...register('cuestion_familiar.detalle')}
            />
          </Field>
        )}
      </Bloque>

      {/* 11. Miedos (opcional) */}
      <Bloque>
        <Field label="¿Tiene miedos o necesidades especiales que debamos saber? (opcional)">
          <textarea rows={2} className={inputCls} {...register('miedos')} />
        </Field>
      </Bloque>

      {/* 12. Observaciones (opcional) */}
      <Bloque>
        <Field label="Observaciones generales (opcional)">
          <textarea
            rows={2}
            className={inputCls}
            {...register('observaciones')}
          />
        </Field>
      </Bloque>

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

function Bloque({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

function Pregunta({
  children,
  requerido,
}: {
  children: React.ReactNode
  requerido?: boolean
}) {
  return (
    <p className="text-sm font-medium text-slate-800">
      {children}
      {requerido && <span className="text-red-600 ml-0.5">*</span>}
    </p>
  )
}

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

type OpcionNoSi = { value: 'no' | 'si'; label: string }
const OPCIONES_NOSI_DEFAULT: OpcionNoSi[] = [
  { value: 'no', label: 'No' },
  { value: 'si', label: 'Sí' },
]

function RadioNoSi({
  name,
  register,
  opciones = OPCIONES_NOSI_DEFAULT,
}: {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  opciones?: OpcionNoSi[]
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {opciones.map((o) => (
        <label key={o.value} className="flex items-center gap-2 cursor-pointer">
          <input type="radio" value={o.value} {...register(name)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  )
}

function BloqueNoSiSimple({
  label,
  name,
  register,
  error,
  requerido,
}: {
  label: string
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  error?: string
  requerido?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-800">
        {label}
        {requerido && <span className="text-red-600 ml-0.5">*</span>}
      </p>
      <RadioNoSi name={name} register={register} />
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  )
}

// Helper para leer errores anidados en formato "a.b.c"
function getError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any,
  path: string
): string | undefined {
  const parts = path.split('.')
  let cur = errors
  for (const p of parts) {
    if (!cur) return undefined
    cur = cur[p]
  }
  return cur?.message
}
