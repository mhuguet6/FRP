import { useState } from 'react'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CampusEdicion, Expediente } from './api'
import { useAutosave } from '../../lib/useAutosave'
import { IndicadorGuardado } from '../../components/ui/IndicadorGuardado'
import { ErrorBanner, MSG_FALTAN_RESPUESTAS } from '../../components/ui/ErrorBanner'
import {
  DECALOGO,
  FALTAS_LEVES,
  FALTAS_GRAVES,
  FALTAS_MUY_GRAVES,
} from './textosLegales'

// ----------------------------------------------------------------------------
// Schema (lenient — todas las decisiones se enforcen en sección 7)
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

const debeSerCierto = z
  .boolean()
  .refine((v) => v === true, 'Debes marcar esta casilla para continuar')

const schema = z.object({
  comunicaciones: z.union(
    [
      z.literal('no'),
      z.literal('email'),
      z.literal('postal'),
      z.literal('ambos'),
    ],
    { error: 'Selecciona una opción' }
  ),

  imagen: z.object({
    decision: z.union(
      [z.literal('autorizo'), z.literal('no_autorizo')],
      { error: 'Selecciona una opción' }
    ),
  }),

  observaciones_generales: noSiTexto,

  agua: noSiTexto,

  nivel_natacion: z
    .object({
      nivel: z.union(
        [
          z.literal('no_sabe'),
          z.literal('basico'),
          z.literal('medio'),
          z.literal('avanzado'),
          z.literal('otro'),
        ],
        { error: 'Selecciona una opción' }
      ),
      otro: z.string().optional(),
    })
    .refine(
      (v) => v.nivel !== 'otro' || (v.otro?.trim().length ?? 0) > 0,
      { path: ['otro'], message: 'Especifica' }
    ),

  llamada_familias: z.object({
    fechas_seleccionadas: z.array(z.string()),
    cualquiera: z.boolean(),
    otra_preferencia: z.string().optional(),
  }),

  decalogo_leido: debeSerCierto,
  reglamento_leido: debeSerCierto,
  reglamento_acepto_normas: debeSerCierto,
  reglamento_entiendo_consecuencias: debeSerCierto,
})

export type Seccion6Values = z.infer<typeof schema>

// ----------------------------------------------------------------------------
// Componente
// ----------------------------------------------------------------------------

type Props = {
  expediente: Expediente
  edicion: CampusEdicion | null
  onSave: (patch: {
    columnas: Partial<Expediente>
    respuestas: Partial<Seccion6Values>
  }) => Promise<void>
  onPrev: () => void
  onNext: () => Promise<void>
}

export function Seccion6Autorizaciones({
  expediente,
  edicion,
  onSave,
  onPrev,
  onNext,
}: Props) {
  const previo =
    (expediente.respuestas?.seccion6 as Partial<Seccion6Values> | undefined) ??
    {}

  const form = useForm<Seccion6Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      comunicaciones: previo.comunicaciones,
      imagen: previo.imagen ?? { decision: undefined },
      observaciones_generales:
        previo.observaciones_generales ?? { respuesta: undefined, detalle: '' },
      agua: previo.agua ?? { respuesta: undefined, detalle: '' },
      nivel_natacion: previo.nivel_natacion ?? { nivel: undefined, otro: '' },
      llamada_familias: previo.llamada_familias ?? {
        fechas_seleccionadas: [],
        cualquiera: false,
        otra_preferencia: '',
      },
      decalogo_leido: previo.decalogo_leido ?? false,
      reglamento_leido: previo.reglamento_leido ?? false,
      reglamento_acepto_normas: previo.reglamento_acepto_normas ?? false,
      reglamento_entiendo_consecuencias:
        previo.reglamento_entiendo_consecuencias ?? false,
    },
  })

  const { register, handleSubmit, watch, formState: { isSubmitting, errors } } = form
  const values = watch()

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      await onSave({ columnas: {}, respuestas: v })
    },
  })

  const fechasLlamada = edicion?.fechas_llamada_familias ?? []

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
            Autorizaciones y normas
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Las firmas se recogen en la última sección.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      {/* Comunicaciones */}
      <Bloque>
        <Titulo>Comunicaciones de la Fundación</Titulo>
        <Pregunta>
          ¿Desea recibir información de la Fundación Rafael del Pino sobre
          futuras actividades?
        </Pregunta>
        <RadioVertical
          name="comunicaciones"
          register={register}
          options={[
            { value: 'no', label: 'No' },
            { value: 'email', label: 'Sí, por correo electrónico' },
            { value: 'postal', label: 'Sí, por correo postal' },
            { value: 'ambos', label: 'Sí, por correo electrónico y postal' },
          ]}
        />
        {errors.comunicaciones?.message && (
          <p className="text-red-600 text-sm">{errors.comunicaciones.message as string}</p>
        )}
      </Bloque>

      {/* Derechos de imagen */}
      <Bloque>
        <Titulo>Derechos de imagen</Titulo>
        <Pregunta>
          ¿Autorizáis el uso de imágenes del/de la participante en la web,
          redes sociales o memoria de actividades del Campus FRP?
        </Pregunta>

        {/* Capa 1: información antes de elegir */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
          <strong className="block mb-1">Importante a tener en cuenta</strong>
          <p>
            Toda la comunicación con las familias durante el Campus se hace
            por la cuenta de <strong>Instagram</strong> del programa y la
            <strong> web</strong>. Si vuestro hijo/a no sale en imágenes,
            tampoco podréis seguir su día a día por estos canales.
          </p>
        </div>

        <RadioVertical
          name="imagen.decision"
          register={register}
          options={[
            {
              value: 'autorizo',
              label: 'Sí, autorizamos el uso de imágenes',
            },
            {
              value: 'no_autorizo',
              label: 'No autorizamos el uso de imágenes',
            },
          ]}
        />
        {errors.imagen?.decision?.message && (
          <p className="text-red-600 text-sm">{errors.imagen.decision.message as string}</p>
        )}

        {/* Capa 2: recordatorio suave si eligen "No" — una sola vez, sin presión */}
        {watch('imagen.decision') === 'no_autorizo' && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900">
            <p>
              Recordamos que la comunicación del Campus se hace por
              Instagram y la web. Si no autorizáis, vuestro hijo/a no
              aparecerá en estas publicaciones, pero tampoco podréis ver
              lo que va haciendo por esos canales.
            </p>
            <p className="mt-2">
              Si cambiáis de opinión, podéis volver a la opción anterior.
              Si estáis seguros, continuad con el formulario.
            </p>
          </div>
        )}
      </Bloque>

      {/* Observaciones generales */}
      <Bloque>
        <Titulo>Observaciones generales para el equipo</Titulo>
        <Pregunta>
          ¿Hay algo importante sobre su hijo/a que considere necesario explicar
          al equipo del Campus?
        </Pregunta>
        <RadioNoSi name="observaciones_generales.respuesta" register={register} />
        {(errors.observaciones_generales as { respuesta?: { message?: string } })?.respuesta?.message && (
          <p className="text-red-600 text-sm">
            {(errors.observaciones_generales as { respuesta?: { message?: string } }).respuesta?.message}
          </p>
        )}
        {watch('observaciones_generales.respuesta') === 'si' && (
          <Field label="Especificar">
            <textarea
              rows={3}
              className={inputCls}
              {...register('observaciones_generales.detalle')}
            />
            {(errors.observaciones_generales as { detalle?: { message?: string } })?.detalle?.message && (
              <p className="text-red-600 text-sm">
                {(errors.observaciones_generales as { detalle?: { message?: string } }).detalle?.message}
              </p>
            )}
          </Field>
        )}
      </Bloque>

      {/* Natación y agua */}
      <Bloque>
        <Titulo>Actividades de agua y natación</Titulo>
        <Pregunta>
          ¿Hay alguna limitación o precaución que debamos tener en cuenta en
          actividades de agua?
        </Pregunta>
        <RadioNoSi name="agua.respuesta" register={register} />
        {(errors.agua as { respuesta?: { message?: string } })?.respuesta?.message && (
          <p className="text-red-600 text-sm">
            {(errors.agua as { respuesta?: { message?: string } }).respuesta?.message}
          </p>
        )}
        {watch('agua.respuesta') === 'si' && (
          <Field label="Especificar">
            <textarea
              rows={2}
              className={inputCls}
              {...register('agua.detalle')}
            />
            {(errors.agua as { detalle?: { message?: string } })?.detalle?.message && (
              <p className="text-red-600 text-sm">
                {(errors.agua as { detalle?: { message?: string } }).detalle?.message}
              </p>
            )}
          </Field>
        )}
        <Pregunta>Nivel de natación del/de la participante:</Pregunta>
        <RadioVertical
          name="nivel_natacion.nivel"
          register={register}
          options={[
            { value: 'no_sabe', label: 'No sabe nadar' },
            { value: 'basico', label: 'Nivel básico' },
            { value: 'medio', label: 'Nivel medio' },
            { value: 'avanzado', label: 'Nivel avanzado' },
            { value: 'otro', label: 'Otro / comentario' },
          ]}
        />
        {(errors.nivel_natacion as { nivel?: { message?: string } })?.nivel?.message && (
          <p className="text-red-600 text-sm">
            {(errors.nivel_natacion as { nivel?: { message?: string } }).nivel?.message}
          </p>
        )}
        {watch('nivel_natacion.nivel') === 'otro' && (
          <Field label="Comentario">
            <input
              type="text"
              className={inputCls}
              {...register('nivel_natacion.otro')}
            />
            {(errors.nivel_natacion as { otro?: { message?: string } })?.otro?.message && (
              <p className="text-red-600 text-sm">
                {(errors.nivel_natacion as { otro?: { message?: string } }).otro?.message}
              </p>
            )}
          </Field>
        )}
      </Bloque>

      {/* Llamada con familias */}
      <Bloque>
        <Titulo>Llamada con familias</Titulo>
        <Pregunta>
          Indica los días que te van bien para una llamada con el equipo del
          Campus (puedes marcar varios):
        </Pregunta>
        <div className="space-y-2">
          {fechasLlamada.length === 0 && (
            <p className="text-sm text-slate-500">
              Aún no hay fechas configuradas para esta edición.
            </p>
          )}
          {fechasLlamada.map((fecha) => (
            <label
              key={fecha}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                value={fecha}
                {...register('llamada_familias.fechas_seleccionadas')}
              />
              <span>{formatearFecha(fecha)}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 cursor-pointer mt-2 border-t border-slate-200 pt-2">
            <input
              type="checkbox"
              {...register('llamada_familias.cualquiera')}
            />
            <span>Nos va bien cualquier día</span>
          </label>
        </div>
        <Field label="Otra preferencia (opcional)">
          <input
            type="text"
            className={inputCls}
            {...register('llamada_familias.otra_preferencia')}
          />
        </Field>
      </Bloque>

      {/* Decálogo */}
      <Bloque>
        <Titulo>Decálogo de convivencia</Titulo>
        <p className="text-sm text-slate-600">
          Durante el Campus FRP queremos crear un ambiente seguro, respetuoso y
          positivo para todos. Lee con tu hijo/a estas normas:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-800 bg-slate-50 rounded-lg p-4">
          {DECALOGO.map((linea, i) => (
            <li key={i}>{linea}</li>
          ))}
        </ol>
        <label className="flex items-start gap-2 cursor-pointer mt-2">
          <input
            type="checkbox"
            className="mt-1"
            {...register('decalogo_leido')}
          />
          <span className="text-sm text-slate-800">
            He leído y entiendo el decálogo de convivencia del Campus FRP.
          </span>
        </label>
        {errors.decalogo_leido?.message && (
          <p className="text-red-600 text-sm">{errors.decalogo_leido.message as string}</p>
        )}
      </Bloque>

      {/* Reglamento */}
      <Bloque>
        <Titulo>Reglamento interno</Titulo>
        <p className="text-sm text-slate-600">
          Para asegurar el cumplimiento del decálogo, el Campus FRP establece
          un reglamento interno con tres tipos de faltas:
        </p>

        <ReglamentoBloque titulo="Faltas leves" items={FALTAS_LEVES} tono="amber" />
        <ReglamentoBloque titulo="Faltas graves" items={FALTAS_GRAVES} tono="orange" />
        <ReglamentoBloque titulo="Faltas muy graves" items={FALTAS_MUY_GRAVES} tono="red" />

        <p className="text-xs text-slate-600">
          En caso de daños en la instalación, serán evaluados por el director
          del CEA El Salugral, la Dirección del Campus FRP y el Responsable de
          la Fundación Rafael del Pino, y si corresponde se emitirá una
          factura.
        </p>

        <div className="space-y-2 pt-2">
          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                {...register('reglamento_leido')}
              />
              <span className="text-sm text-slate-800">
                He leído y entiendo el reglamento interno de los participantes.
              </span>
            </label>
            {errors.reglamento_leido?.message && (
              <p className="text-red-600 text-sm ml-6">{errors.reglamento_leido.message as string}</p>
            )}
          </div>
          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                {...register('reglamento_acepto_normas')}
              />
              <span className="text-sm text-slate-800">
                Acepto que el/la participante debe cumplir las normas de
                convivencia del Campus FRP.
              </span>
            </label>
            {errors.reglamento_acepto_normas?.message && (
              <p className="text-red-600 text-sm ml-6">{errors.reglamento_acepto_normas.message as string}</p>
            )}
          </div>
          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                {...register('reglamento_entiendo_consecuencias')}
              />
              <span className="text-sm text-slate-800">
                Entiendo que el incumplimiento de estas normas puede tener
                consecuencias según la gravedad de la falta.
              </span>
            </label>
            {errors.reglamento_entiendo_consecuencias?.message && (
              <p className="text-red-600 text-sm ml-6">{errors.reglamento_entiendo_consecuencias.message as string}</p>
            )}
          </div>
        </div>
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

function formatearFecha(iso: string): string {
  const d = new Date(iso)
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`
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

function RadioVertical({
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
    <div className="space-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 cursor-pointer">
          <input type="radio" value={o.value} className="mt-1" {...register(name)} />
          <span className="text-sm">{o.label}</span>
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

function ReglamentoBloque({
  titulo,
  items,
  tono,
}: {
  titulo: string
  items: readonly string[]
  tono: 'amber' | 'orange' | 'red'
}) {
  const cls = {
    amber: 'bg-amber-50 text-amber-900',
    orange: 'bg-orange-50 text-orange-900',
    red: 'bg-red-50 text-red-900',
  }[tono]
  return (
    <div className={`rounded-lg p-3 ${cls}`}>
      <div className="text-sm font-semibold mb-1.5">{titulo}</div>
      <ul className="text-sm list-disc list-inside space-y-0.5">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  )
}
