import { useRef, useState } from 'react'
import { actualizarExpediente, registrarEvento, type Expediente } from './api'
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from './SignatureCanvas'
import {
  firmasRequeridas,
  validarParaEnvio,
  type CampoFaltante,
} from './validacion'
import {
  subirYRegistrarFirma,
  textoAutorizacion,
  type TipoFirma,
} from './firmaService'

type Props = {
  expediente: Expediente
  onPrev: () => void
  onEnviado: () => void
  onGoToSeccion: (n: number) => Promise<void>
}

export function Seccion7Revision({
  expediente,
  onPrev,
  onEnviado,
  onGoToSeccion,
}: Props) {
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previoS7 = (expediente.respuestas?.seccion7 as any) ?? {}
  const [ninoNombre, setNinoNombre] = useState<string>(
    previoS7.firma_nino_nombre ?? ''
  )

  const refDatosImagen = useRef<SignatureCanvasHandle>(null)
  const refVacunacion = useRef<SignatureCanvasHandle>(null)
  const refMedicacion = useRef<SignatureCanvasHandle>(null)
  const refReglamento = useRef<SignatureCanvasHandle>(null)
  const sigRefs: Record<TipoFirma, React.RefObject<SignatureCanvasHandle>> = {
    datos_imagen: refDatosImagen,
    vacunacion: refVacunacion,
    medicacion: refMedicacion,
    reglamento_tutor: refReglamento,
  }

  const faltantes: CampoFaltante[] = validarParaEnvio(expediente)
  const firmasNecesarias = firmasRequeridas(expediente)

  const tutorNombre = expediente.tutor_nombre ?? ''
  const alumnoNombre = `${expediente.alumno_nombre ?? ''} ${
    expediente.alumno_apellidos ?? ''
  }`.trim()

  const onSubmit = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    try {
      // Validar nombre del niño
      if (!ninoNombre.trim()) {
        setErrorEnvio('El/la participante debe escribir su nombre.')
        setEnviando(false)
        return
      }

      // Validar firmas presentes
      const errores: string[] = []
      const blobs: Partial<Record<TipoFirma, Blob>> = {}
      for (const f of firmasNecesarias) {
        const tipo = f.tipo as TipoFirma
        const ref = sigRefs[tipo].current
        if (!ref || ref.isEmpty()) {
          errores.push(`Falta firmar: ${f.titulo}`)
        } else {
          const blob = await ref.toBlob()
          if (blob) blobs[tipo] = blob
        }
      }
      if (errores.length > 0) {
        setErrorEnvio(errores.join('. '))
        setEnviando(false)
        return
      }

      const ahora = new Date().toISOString()

      // Subir firmas + insertar filas
      for (const f of firmasNecesarias) {
        const tipo = f.tipo as TipoFirma
        const blob = blobs[tipo]
        if (!blob) continue
        const texto = textoAutorizacion(tipo, {
          tutorNombre,
          alumnoNombre,
          timestamp: ahora,
        })
        await subirYRegistrarFirma({
          expedienteId: expediente.id,
          tipo,
          blob,
          firmadoPor: tutorNombre,
          textoAutorizacion: texto,
        })
      }

      // Actualizar expediente
      const nuevasRespuestas = {
        ...(expediente.respuestas ?? {}),
        seccion7: {
          firma_nino_nombre: ninoNombre.trim(),
          enviado_at: ahora,
        },
      }
      await actualizarExpediente(expediente.id, {
        estado: 'enviado',
        submitted_at: ahora,
        respuestas: nuevasRespuestas,
      })

      await registrarEvento(expediente.id, 'formulario_enviado', {
        firmas: firmasNecesarias.map((f) => f.tipo),
      })

      onEnviado()
    } catch (e) {
      console.error('[envío]', e)
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'Error al enviar'
      setErrorEnvio(`No hemos podido enviar el formulario: ${msg}`)
      setEnviando(false)
    }
  }

  const puedeEnviar = faltantes.length === 0
  const r = expediente.respuestas as Record<string, unknown> | undefined

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Revisión y envío
        </h2>
        <p className="text-slate-600 text-sm mt-1">
          Comprueba el resumen, firma los documentos que aplican y envía el
          formulario.
        </p>
      </div>

      {/* Resumen rápido */}
      <Bloque>
        <Titulo>Resumen</Titulo>
        <dl className="text-sm space-y-1.5">
          <Row k="Participante" v={alumnoNombre || '—'} />
          <Row k="Tutor/a" v={tutorNombre || '—'} />
          <Row
            k="Alergias"
            v={(() => {
              const a = (r?.['seccion3'] as
                | { alergias?: { respuesta?: string; que?: string } }
                | undefined)?.alergias
              if (a?.respuesta === 'si') return `Sí — ${a.que ?? ''}`
              if (a?.respuesta === 'no') return 'No'
              return '—'
            })()}
          />
          <Row
            k="Medicación durante Campus"
            v={
              (r?.['seccion4'] as { durante_campus?: { respuesta?: string } })
                ?.durante_campus?.respuesta === 'si'
                ? 'Sí'
                : (r?.['seccion4'] as { durante_campus?: { respuesta?: string } })?.durante_campus?.respuesta === 'no'
                  ? 'No'
                  : '—'
            }
          />
        </dl>
      </Bloque>

      {/* Faltantes */}
      {faltantes.length > 0 && (
        <Bloque>
          <Titulo>Faltan estos datos antes de poder enviar</Titulo>
          <ul className="space-y-1.5 text-sm">
            {faltantes.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="text-amber-900">{f.descripcion}</span>
                <button
                  type="button"
                  onClick={() => onGoToSeccion(f.seccion)}
                  className="text-xs text-slate-700 underline shrink-0"
                >
                  Ir a Sección {f.seccion}
                </button>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {/* Firmas */}
      <Bloque>
        <Titulo>Firmas</Titulo>
        <p className="text-sm text-slate-600">
          Firma con el dedo (móvil o tableta) o con el ratón. Si te equivocas,
          pulsa "Limpiar".
        </p>

        {firmasNecesarias.map((f) => {
          const tipo = f.tipo as TipoFirma
          const ref = sigRefs[tipo]
          return (
            <div
              key={tipo}
              className="rounded-xl border border-slate-200 p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-slate-900">
                {f.titulo}
              </div>
              <div className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 rounded-lg p-3">
                {textoAutorizacion(tipo, {
                  tutorNombre: tutorNombre || '[tutor/a]',
                  alumnoNombre: alumnoNombre || '[participante]',
                  timestamp: new Date().toISOString(),
                })}
              </div>
              <SignatureCanvas ref={ref} ariaLabel={f.titulo} />
              <button
                type="button"
                onClick={() => ref.current?.clear()}
                className="text-xs text-red-600 hover:underline"
              >
                Limpiar firma
              </button>
            </div>
          )
        })}

        {/* Nombre escrito por el niño/a */}
        <div className="rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-900">
            Nombre del/de la participante
          </div>
          <p className="text-xs text-slate-600">
            Pide a tu hijo/a que escriba aquí su nombre completo en señal de que
            ha leído o se le ha explicado el decálogo y el reglamento.
          </p>
          <input
            type="text"
            value={ninoNombre}
            onChange={(e) => setNinoNombre(e.target.value)}
            placeholder="Nombre y apellidos"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </Bloque>

      {errorEnvio && (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
          {errorEnvio}
        </div>
      )}

      <div className="flex justify-between gap-3 pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={onPrev}
          disabled={enviando}
          className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 hover:bg-slate-50 disabled:opacity-50"
        >
          ← Atrás
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={enviando || !puedeEnviar}
          className="rounded-lg bg-emerald-700 text-white font-medium px-4 py-2.5 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {enviando ? 'Enviando…' : 'Enviar formulario'}
        </button>
      </div>
      {!puedeEnviar && (
        <p className="text-xs text-amber-700 -mt-4 text-right">
          Completa los datos pendientes para habilitar el envío.
        </p>
      )}
    </div>
  )
}

function Bloque({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}
function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-slate-900">{children}</h3>
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-900 text-right max-w-[60%]">{v}</dd>
    </div>
  )
}
