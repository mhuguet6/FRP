import { useRef, useState } from 'react'
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
import { SignatureCanvas, type SignatureCanvasHandle } from './SignatureCanvas'
import { subirYRegistrarFirma, textoAutorizacion } from './firmaService'

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

const debeSerCierto = z
  .boolean()
  .refine((v) => v === true, 'Debes marcar esta casilla para continuar')

const schema = z.object({
  decalogo_leido: debeSerCierto,
  reglamento_leido: debeSerCierto,
  reglamento_acepto_normas: debeSerCierto,
  reglamento_entiendo_consecuencias: debeSerCierto,

  observaciones_generales: noSiTexto,
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
      decalogo_leido: previo.decalogo_leido ?? false,
      reglamento_leido: previo.reglamento_leido ?? false,
      reglamento_acepto_normas: previo.reglamento_acepto_normas ?? false,
      reglamento_entiendo_consecuencias:
        previo.reglamento_entiendo_consecuencias ?? false,
      observaciones_generales:
        previo.observaciones_generales ?? { respuesta: undefined, detalle: '' },
    },
  })

  const { register, handleSubmit, watch, formState: { isSubmitting, errors } } = form
  const values = watch()

  const firmaRef = useRef<SignatureCanvasHandle>(null)
  const firmaNinoRef = useRef<SignatureCanvasHandle>(null)
  const [enviandoFirma, setEnviandoFirma] = useState(false)

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      await onSave({ columnas: {}, respuestas: v })
    },
  })

  const alumnoNombre = `${expediente.alumno_nombre ?? ''} ${
    expediente.alumno_apellidos ?? ''
  }`.trim()

  const [submitError, setSubmitError] = useState<string | null>(null)
  const onValid = async () => {
    setSubmitError(null)
    const refTutor = firmaRef.current
    const refNino = firmaNinoRef.current
    if (!refTutor || refTutor.isEmpty()) {
      setSubmitError(
        'Falta la firma del tutor/a conformidad con el decálogo y el reglamento.'
      )
      return
    }
    if (!refNino || refNino.isEmpty()) {
      setSubmitError(
        'Falta la firma del/de la participante conformidad con el decálogo y el reglamento.'
      )
      return
    }
    setEnviandoFirma(true)
    try {
      const ahora = new Date().toISOString()

      // Firma del tutor
      const blobTutor = await refTutor.toBlob()
      if (!blobTutor) throw new Error('No se pudo generar la firma del tutor')
      await subirYRegistrarFirma({
        expedienteId: expediente.id,
        tipo: 'reglamento_tutor',
        blob: blobTutor,
        firmadoPor: expediente.tutor_email ?? 'tutor/a firmante',
        textoAutorizacion: textoAutorizacion('reglamento_tutor', {
          alumnoNombre: alumnoNombre || '[participante]',
          timestamp: ahora,
        }),
      })

      // Firma del niño/a
      const blobNino = await refNino.toBlob()
      if (!blobNino) throw new Error('No se pudo generar la firma del/de la participante')
      await subirYRegistrarFirma({
        expedienteId: expediente.id,
        tipo: 'reglamento_nino',
        blob: blobNino,
        firmadoPor: alumnoNombre || 'participante',
        textoAutorizacion: textoAutorizacion('reglamento_nino', {
          alumnoNombre: alumnoNombre || '[participante]',
          timestamp: ahora,
        }),
      })
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'No se pudieron guardar las firmas'
      )
      setEnviandoFirma(false)
      return
    }
    setEnviandoFirma(false)
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
            Decálogo de convivencia
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Lee con tu hijo/a el decálogo y el reglamento, marca las casillas y
            firma al final.
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

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
            <span className="text-red-600 ml-0.5">*</span>
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
                <span className="text-red-600 ml-0.5">*</span>
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
                <span className="text-red-600 ml-0.5">*</span>
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
                <span className="text-red-600 ml-0.5">*</span>
              </span>
            </label>
            {errors.reglamento_entiendo_consecuencias?.message && (
              <p className="text-red-600 text-sm ml-6">{errors.reglamento_entiendo_consecuencias.message as string}</p>
            )}
          </div>
        </div>
      </Bloque>

      {/* Firmas: tutor + participante */}
      <Bloque>
        <Titulo>Firmas</Titulo>
        <p className="text-sm text-slate-600">
          Firma de conformidad con el decálogo y el reglamento interno del
          Campus FRP, y firma del/de la participante.
        </p>

        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            Firma del padre/madre/tutor/a
            <span className="text-red-600 ml-0.5">*</span>
          </div>
          <div className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 rounded-lg p-3">
            {textoAutorizacion('reglamento_tutor', {
              alumnoNombre: alumnoNombre || '[participante]',
              timestamp: new Date().toISOString(),
            })}
          </div>
          <SignatureCanvas
            ref={firmaRef}
            ariaLabel="Firma conformidad con decálogo y reglamento"
          />
          <button
            type="button"
            onClick={() => firmaRef.current?.clear()}
            className="text-xs text-red-600 hover:underline"
          >
            Limpiar firma
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            Firma del/de la participante
            <span className="text-red-600 ml-0.5">*</span>
          </div>
          <p className="text-xs text-slate-600">
            Pide a tu hijo/a que firme aquí, como acto de aceptación del
            decálogo y el reglamento.
          </p>
          <div className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 rounded-lg p-3">
            {textoAutorizacion('reglamento_nino', {
              alumnoNombre: alumnoNombre || '[participante]',
              timestamp: new Date().toISOString(),
            })}
          </div>
          <SignatureCanvas
            ref={firmaNinoRef}
            ariaLabel="Firma del/de la participante"
          />
          <button
            type="button"
            onClick={() => firmaNinoRef.current?.clear()}
            className="text-xs text-red-600 hover:underline"
          >
            Limpiar firma
          </button>
        </div>
      </Bloque>

      {/* Observaciones generales — al final, después de las firmas */}
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

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      <div className="flex justify-between gap-3 pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={onPrev}
          disabled={enviandoFirma}
          className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 hover:bg-slate-50 disabled:opacity-50"
        >
          ← Atrás
        </button>
        <button
          type="submit"
          disabled={isSubmitting || enviandoFirma}
          className="rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {enviandoFirma ? 'Guardando firma…' : 'Siguiente →'}
        </button>
      </div>
    </form>
  )
}

// ----------------------------------------------------------------------------
// Estilos / sub-componentes
// ----------------------------------------------------------------------------

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
  requerido,
  children,
}: {
  label: string
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
