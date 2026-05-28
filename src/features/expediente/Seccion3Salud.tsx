import { useRef, useState } from 'react'
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
import { SignatureCanvas, type SignatureCanvasHandle } from './SignatureCanvas'
import { subirYRegistrarFirma, textoAutorizacion } from './firmaService'

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

const VACUNACION_OPTS = ['al_dia', 'parcial', 'exento'] as const
const VACUNACION_LABEL: Record<(typeof VACUNACION_OPTS)[number], string> = {
  al_dia: 'Tiene el calendario de vacunación al día',
  parcial: 'Tiene vacunación parcial',
  exento: 'Está exento/a por razones médicas',
}

const schema = z
  .object({
    tutor_autoriza_nombre: z.string().min(1, 'Obligatorio'),
    autoriza_medicacion: z.union(
      [z.literal('si'), z.literal('no_toma')],
      { error: 'Selecciona una opción' }
    ),
    vacunacion_estado: z.enum(VACUNACION_OPTS, {
      error: 'Selecciona una opción',
    }),
    vacunacion_detalle: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.vacunacion_estado === 'parcial' && !v.vacunacion_detalle?.trim()) {
      ctx.addIssue({
        path: ['vacunacion_detalle'],
        code: z.ZodIssueCode.custom,
        message: '¿Qué vacunas faltan o qué consideración hay?',
      })
    }
    if (v.vacunacion_estado === 'exento' && !v.vacunacion_detalle?.trim()) {
      ctx.addIssue({
        path: ['vacunacion_detalle'],
        code: z.ZodIssueCode.custom,
        message: 'Explica la razón',
      })
    }
  })

export type Seccion3Values = z.input<typeof schema>

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

export function Seccion3Salud({
  expediente,
  edicion,
  onSave,
  onPrev,
  onNext,
}: Props) {
  const previo =
    (expediente.respuestas?.seccion3 as Partial<Seccion3Values> | undefined) ??
    {}

  // ¿Hay medicación declarada en S2? Determina si la firma de medicación es
  // obligatoria al confirmar la autorización en esta sección.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s2 = (expediente.respuestas?.seccion2 as any) ?? {}
  const tieneMedicacionEnS2 =
    s2?.medicacion?.respuesta === 'si' &&
    Array.isArray(s2?.medicacion?.medicamentos) &&
    s2.medicacion.medicamentos.length > 0

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Seccion3Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      tutor_autoriza_nombre:
        previo.tutor_autoriza_nombre || expediente.tutor_nombre || '',
      autoriza_medicacion:
        previo.autoriza_medicacion ?? (undefined as never),
      vacunacion_estado:
        (previo.vacunacion_estado as Seccion3Values['vacunacion_estado']) ??
        (undefined as never),
      vacunacion_detalle: previo.vacunacion_detalle ?? '',
    },
  })

  const values = watch()
  const autoriza = watch('autoriza_medicacion')
  const vacEstado = watch('vacunacion_estado')

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

  // Firma de medicación — solo si autoriza Y hay medicación en S2.
  const necesitaFirma = autoriza === 'si' && tieneMedicacionEnS2
  const firmaRef = useRef<SignatureCanvasHandle>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const alumnoNombre = `${expediente.alumno_nombre ?? ''} ${
    expediente.alumno_apellidos ?? ''
  }`.trim()

  const onValid = async () => {
    setSubmitError(null)

    // Si necesita firma, validar canvas + subir
    if (necesitaFirma) {
      const ref = firmaRef.current
      if (!ref || ref.isEmpty()) {
        setSubmitError('Falta firmar la autorización de medicación.')
        return
      }
      setEnviando(true)
      try {
        const blob = await ref.toBlob()
        if (!blob) throw new Error('No se pudo generar la firma')
        const ahora = new Date().toISOString()
        const texto = textoAutorizacion('medicacion', {
          alumnoNombre: alumnoNombre || '[participante]',
          timestamp: ahora,
        })
        await subirYRegistrarFirma({
          expedienteId: expediente.id,
          tipo: 'medicacion',
          blob,
          firmadoPor:
            expediente.tutor_email ?? values.tutor_autoriza_nombre ?? 'tutor/a',
          textoAutorizacion: texto,
        })
      } catch (e) {
        setSubmitError(
          e instanceof Error ? e.message : 'No se pudo guardar la firma'
        )
        setEnviando(false)
        return
      }
      setEnviando(false)
    }

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
            Autorizaciones médicas
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            3 minutos. Sin esta autorización firmada no podemos suministrar
            medicación durante el Campus
            {edicion?.fecha_inicio && edicion?.fecha_fin && (
              <>
                {' '}({formatearRangoCampus(edicion.fecha_inicio, edicion.fecha_fin)})
              </>
            )}
            .
          </p>
        </div>
        <IndicadorGuardado status={saveStatus} />
      </div>

      {/* 1. Nombre del familiar/tutor que autoriza */}
      <Field
        label="Nombre del familiar/tutor que autoriza"
        requerido
        error={errors.tutor_autoriza_nombre?.message}
      >
        <input
          type="text"
          autoComplete="name"
          className={inputCls}
          {...register('tutor_autoriza_nombre')}
        />
      </Field>

      {/* 2. Autorización de medicación */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">
          Autorizo al Campus FRP a suministrar medicación
          <span className="text-red-600 ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              value="si"
              className="mt-1"
              {...register('autoriza_medicacion')}
            />
            <span>
              Sí, autorizo a tomar la medicación detallada en la pantalla
              anterior
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              value="no_toma"
              className="mt-1"
              {...register('autoriza_medicacion')}
            />
            <span>Mi hijo/a no toma ninguna medicación</span>
          </label>
        </div>
        {errors.autoriza_medicacion?.message && (
          <p className="text-red-600 text-sm">
            {errors.autoriza_medicacion.message as string}
          </p>
        )}
        {autoriza === 'si' && !tieneMedicacionEnS2 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 mt-2">
            ⚠ Has marcado que autorizas pero en la sección 2 (Salud) no hay
            medicación registrada. Vuelve a la sección 2 a añadir los
            medicamentos antes de firmar aquí.
          </div>
        )}
        {autoriza === 'no_toma' && tieneMedicacionEnS2 && (
          <div className="rounded-lg bg-red-50 border border-red-300 text-red-900 text-xs p-3 mt-2">
            ⚠ <strong>Hay una incoherencia.</strong> En la sección 2 (Salud)
            has detallado medicación para tu hijo/a, pero aquí marcas que no
            toma ninguna. Revisa: o bien borra la medicación de la sección 2
            si no la toma, o cambia esta respuesta a "Sí, autorizo".
          </div>
        )}
      </div>

      {/* 3. Declaración de vacunación */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">
          Declaración de vacunación
          <span className="text-red-600 ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          {VACUNACION_OPTS.map((opt) => (
            <label
              key={opt}
              className="flex items-start gap-2 cursor-pointer"
            >
              <input
                type="radio"
                value={opt}
                className="mt-1"
                {...register('vacunacion_estado')}
              />
              <span>{VACUNACION_LABEL[opt]}</span>
            </label>
          ))}
        </div>
        {errors.vacunacion_estado?.message && (
          <p className="text-red-600 text-sm">
            {errors.vacunacion_estado.message as string}
          </p>
        )}

        {vacEstado === 'parcial' && (
          <Field
            label="¿Qué vacunas faltan o qué consideración hay?"
            requerido
            error={errors.vacunacion_detalle?.message}
          >
            <textarea
              rows={3}
              className={inputCls}
              {...register('vacunacion_detalle')}
            />
          </Field>
        )}
        {vacEstado === 'exento' && (
          <Field
            label="Explica la razón"
            requerido
            error={errors.vacunacion_detalle?.message}
          >
            <textarea
              rows={3}
              className={inputCls}
              {...register('vacunacion_detalle')}
            />
          </Field>
        )}
      </div>

      {/* 4. Firma — solo si autoriza Y hay medicación en S2 */}
      {necesitaFirma && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-900">
            Firma del familiar/tutor
            <span className="text-red-600 ml-0.5">*</span>
          </div>
          <div className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 rounded-lg p-3">
            {textoAutorizacion('medicacion', {
              alumnoNombre: alumnoNombre || '[participante]',
              timestamp: new Date().toISOString(),
            })}
          </div>
          <SignatureCanvas
            ref={firmaRef}
            ariaLabel="Firma autorización de medicación"
          />
          <button
            type="button"
            onClick={() => firmaRef.current?.clear()}
            className="text-xs text-red-600 hover:underline"
          >
            Limpiar firma
          </button>
        </div>
      )}

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={isSubmitting || enviando}
          className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 hover:bg-slate-50 disabled:opacity-50"
        >
          ← Atrás
        </button>
        <button
          type="submit"
          disabled={isSubmitting || enviando}
          className="rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {enviando ? 'Guardando firma…' : 'Siguiente →'}
        </button>
      </div>
    </form>
  )
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function formatearRangoCampus(ini: string, fin: string): string {
  const di = new Date(ini)
  const df = new Date(fin)
  if (Number.isNaN(di.getTime()) || Number.isNaN(df.getTime())) return ''
  const mes = di.toLocaleDateString('es-ES', { month: 'long' })
  const ano = di.getFullYear()
  return `${di.getDate()}–${df.getDate()} de ${mes} de ${ano}`
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
