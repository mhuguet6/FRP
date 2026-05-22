import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Expediente, CampusEdicion } from './api'
import { useAutosave } from '../../lib/useAutosave'
import { IndicadorGuardado } from '../../components/ui/IndicadorGuardado'
import { ErrorBanner, MSG_FALTAN_RESPUESTAS } from '../../components/ui/ErrorBanner'
import { FotoUpload } from './FotoUpload'

const schema = z.object({
  nombre: z.string().min(1, 'Obligatorio'),
  apellidos: z.string().min(1, 'Obligatorio'),
  fecha_nacimiento: z
    .string()
    .min(1, 'Obligatorio')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha no válida'),
  direccion: z.string().min(1, 'Obligatorio'),
})

export type Seccion1Values = z.infer<typeof schema>

type RespuestasSeccion1 = Partial<Seccion1Values>

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

type Props = {
  expediente: Expediente
  edicion: CampusEdicion | null
  onSave: (patch: {
    columnas: Partial<Expediente>
    respuestas: RespuestasSeccion1
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
  const previo = (expediente.respuestas?.seccion1 as RespuestasSeccion1) ?? {}

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Seccion1Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      nombre: expediente.alumno_nombre ?? previo.nombre ?? '',
      apellidos: expediente.alumno_apellidos ?? previo.apellidos ?? '',
      fecha_nacimiento: expediente.fecha_nacimiento ?? previo.fecha_nacimiento ?? '',
      direccion: previo.direccion ?? '',
    },
  })

  const values = watch()
  const edad = calcularEdad(values.fecha_nacimiento, edicion?.fecha_inicio ?? '')

  const saveStatus = useAutosave({
    data: values,
    enabled: true,
    save: async (v) => {
      await onSave({
        columnas: {
          alumno_nombre: v.nombre || null,
          alumno_apellidos: v.apellidos || null,
          fecha_nacimiento: v.fecha_nacimiento || null,
        },
        respuestas: v,
      })
    },
  })

  // Cuando todos los campos obligatorios están rellenos por primera vez,
  // marcamos el expediente como "en_progreso".
  useEffect(() => {
    if (
      expediente.estado === 'creado' &&
      values.nombre &&
      values.apellidos &&
      values.fecha_nacimiento
    ) {
      onSave({
        columnas: { estado: 'en_progreso' },
        respuestas: values,
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expediente.estado, values.nombre, values.apellidos, values.fecha_nacimiento])

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
      className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6"
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

      <div className="space-y-4">
        <FotoUpload
          expedienteId={expediente.id}
          fotoPath={expediente.foto_path}
          onChange={onFotoChange}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Nombre"
            error={errors.nombre?.message}
          >
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
          <input type="date" className={inputCls} {...register('fecha_nacimiento')} />
          {edad !== null && (
            <p className="text-xs text-slate-500 mt-1">
              Edad al inicio del Campus: <strong>{edad} años</strong>
              {edicion && (
                <> (inicio: {new Date(edicion.fecha_inicio).toLocaleDateString('es-ES')})</>
              )}
            </p>
          )}
        </Field>

        <Field label="Dirección completa" error={errors.direccion?.message}>
          <textarea
            rows={2}
            className={inputCls}
            placeholder="Calle, número, código postal, ciudad"
            {...register('direccion')}
          />
        </Field>
      </div>

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
