import { useRef, useState } from 'react'
import { actualizarExpediente, registrarEvento, type Expediente } from './api'
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from './SignatureCanvas'
import { subirYRegistrarFirma, textoAutorizacion } from './firmaService'

type Props = {
  expediente: Expediente
  onPrev: () => void
  onEnviado: () => void
}

// Estado RGPD que se guarda en respuestas.seccion7
type RgpdValues = {
  excluir_email: boolean
  excluir_postal: boolean
  excluir_imagen: boolean
  participante_nombre: string
  tutor_nombre: string
}

export function Seccion7Revision({
  expediente,
  onPrev,
  onEnviado,
}: Props) {
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const refDatosImagen = useRef<SignatureCanvasHandle>(null)

  const previoS7 = (expediente.respuestas?.seccion7 ?? {}) as Partial<{
    comunicaciones: { no_email?: boolean; no_postal?: boolean }
    imagen: { no_autorizo?: boolean }
    participante_nombre: string
    tutor_nombre: string
  }>

  const alumnoNombreSugerido = `${expediente.alumno_nombre ?? ''} ${
    expediente.alumno_apellidos ?? ''
  }`.trim()

  const [rgpd, setRgpd] = useState<RgpdValues>({
    excluir_email: previoS7.comunicaciones?.no_email ?? false,
    excluir_postal: previoS7.comunicaciones?.no_postal ?? false,
    excluir_imagen: previoS7.imagen?.no_autorizo ?? false,
    participante_nombre: previoS7.participante_nombre ?? alumnoNombreSugerido,
    tutor_nombre: previoS7.tutor_nombre ?? '',
  })

  const esModificacion =
    !!expediente.submitted_at && !!expediente.modificado_postenvio_at

  const firmadoPor =
    expediente.tutor_email ?? (rgpd.tutor_nombre?.trim() || 'tutor/a firmante')

  const onSubmit = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    try {
      const errores: string[] = []
      if (!rgpd.participante_nombre.trim())
        errores.push('Falta el nombre del/de la participante')
      if (!rgpd.tutor_nombre.trim())
        errores.push('Falta el nombre del familiar/tutor')

      const ref = refDatosImagen.current
      if (!ref || ref.isEmpty()) {
        errores.push('Falta la firma del familiar/tutor')
      }
      if (errores.length > 0) {
        setErrorEnvio(errores.join('. '))
        setEnviando(false)
        return
      }

      const blob = await ref!.toBlob()
      if (!blob) {
        setErrorEnvio('No se pudo generar la firma.')
        setEnviando(false)
        return
      }

      const ahora = new Date().toISOString()
      const texto = textoAutorizacion('datos_imagen', {
        alumnoNombre: rgpd.participante_nombre.trim(),
        timestamp: ahora,
      })
      await subirYRegistrarFirma({
        expedienteId: expediente.id,
        tipo: 'datos_imagen',
        blob,
        firmadoPor,
        textoAutorizacion: texto,
      })

      const nuevasRespuestas = {
        ...(expediente.respuestas ?? {}),
        seccion7: {
          ...((expediente.respuestas?.seccion7 as object | undefined) ?? {}),
          comunicaciones: {
            no_email: rgpd.excluir_email,
            no_postal: rgpd.excluir_postal,
          },
          imagen: {
            no_autorizo: rgpd.excluir_imagen,
          },
          participante_nombre: rgpd.participante_nombre.trim(),
          tutor_nombre: rgpd.tutor_nombre.trim(),
          ...(esModificacion
            ? { modificacion_confirmada_at: ahora }
            : { enviado_at: ahora }),
        },
      }
      if (esModificacion) {
        await actualizarExpediente(expediente.id, {
          modificado_postenvio_at: null,
          respuestas: nuevasRespuestas,
        })
        await registrarEvento(expediente.id, 'modificacion_confirmada', {
          firmas: ['datos_imagen'],
        })
      } else {
        await actualizarExpediente(expediente.id, {
          estado: 'enviado',
          submitted_at: ahora,
          respuestas: nuevasRespuestas,
        })
        await registrarEvento(expediente.id, 'formulario_enviado', {
          firmas: ['datos_imagen'],
        })
      }

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

  const r = expediente.respuestas as Record<string, unknown> | undefined

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          {esModificacion ? 'Revisión y confirmación' : 'Datos, imagen y envío'}
        </h2>
        <p className="text-slate-600 text-sm mt-1">
          {esModificacion
            ? 'Has hecho cambios después de enviar. Vuelve a firmar para confirmar las modificaciones.'
            : 'Lee los derechos de imagen y datos, indica tus preferencias, firma y envía el formulario.'}
        </p>
      </div>
      {esModificacion && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
          ✎ Modo modificación. Tu formulario está enviado; al confirmar, los
          cambios quedarán definitivos y se notificará al equipo del Campus.
        </div>
      )}

      {/* Resumen rápido */}
      <Bloque>
        <Titulo>Resumen</Titulo>
        <dl className="text-sm space-y-1.5">
          <Row k="Participante" v={alumnoNombreSugerido || '—'} />
          <Row k="Tutor/a (email)" v={expediente.tutor_email || '—'} />
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

      {/* Derechos de imagen y datos */}
      <Bloque>
        <details
          open
          className="rounded-xl border border-slate-200 bg-white open:bg-white"
        >
          <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-900">
            ▸ Derechos de imagen y datos
          </summary>
          <div className="px-4 py-4 space-y-4 border-t border-slate-200">
            {/* Texto RGPD resumido */}
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-800 space-y-2">
              <p>
                <strong>Información sobre protección de datos.</strong>{' '}
                Responsable del tratamiento:{' '}
                <strong>Fundación Rafael del Pino</strong>, C/ Rafael Calvo 39,
                28010 Madrid. Tratamos los datos para gestionar la inscripción
                y desarrollo del Campus FRP en virtud del consentimiento que
                otorgáis al firmar este formulario. No se ceden a terceros
                salvo obligación legal.
              </p>
              <p>
                Podéis ejercer los derechos de acceso, rectificación,
                supresión, oposición, limitación y portabilidad escribiendo a{' '}
                <a
                  href="mailto:protecciondedatos@frdelpino.es"
                  className="underline"
                >
                  protecciondedatos@frdelpino.es
                </a>
                . Tenéis derecho a reclamar ante la Agencia Española de
                Protección de Datos (
                <a
                  href="https://www.aepd.es"
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  www.aepd.es
                </a>
                ).
              </p>
            </div>

            {/* Aviso previo sobre comunicación del Campus */}
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
              <strong className="block mb-1">
                Importante a tener en cuenta
              </strong>
              <p>
                Toda la comunicación con las familias durante el Campus se
                hace por la cuenta de <strong>Instagram</strong> del programa y
                la <strong>web</strong>. Si vuestro hijo/a no sale en
                imágenes, tampoco podréis seguir su día a día por estos
                canales.
              </p>
            </div>

            {/* Casillas de exclusión voluntaria */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-900">
                Casillas de exclusión voluntaria
              </div>
              <p className="text-xs text-slate-600">
                Marca solo lo que <strong>NO</strong> quieres que ocurra. Si
                dejas todas en blanco, autorizas comunicaciones por email,
                postal y uso de imágenes.
              </p>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={rgpd.excluir_email}
                  onChange={(e) =>
                    setRgpd((r) => ({ ...r, excluir_email: e.target.checked }))
                  }
                />
                <span className="text-sm text-slate-800">
                  No quiero recibir información por correo electrónico.
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={rgpd.excluir_postal}
                  onChange={(e) =>
                    setRgpd((r) => ({ ...r, excluir_postal: e.target.checked }))
                  }
                />
                <span className="text-sm text-slate-800">
                  No quiero recibir información por correo postal.
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={rgpd.excluir_imagen}
                  onChange={(e) =>
                    setRgpd((r) => ({ ...r, excluir_imagen: e.target.checked }))
                  }
                />
                <span className="text-sm text-slate-800">
                  No autorizo el uso de imágenes de mi hijo/a en la web,
                  redes sociales ni memoria de actividades.
                </span>
              </label>

              {/* Aviso suave si excluyen imágenes */}
              {rgpd.excluir_imagen && (
                <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900">
                  <p>
                    Recordamos que la comunicación del Campus se hace por
                    Instagram y la web. Si no autorizáis, vuestro hijo/a no
                    aparecerá en estas publicaciones, pero tampoco podréis
                    ver lo que va haciendo por esos canales.
                  </p>
                  <p className="mt-2">
                    Si cambiáis de opinión, podéis desmarcar la casilla. Si
                    estáis seguros, continuad con el formulario y el equipo
                    contactará para confirmarlo.
                  </p>
                </div>
              )}
            </div>
          </div>
        </details>
      </Bloque>

      {/* Identificación + firma del tutor */}
      <Bloque>
        <Titulo>Identificación y firma</Titulo>

        <Field
          label="Nombre y apellidos del/de la participante"
          requerido
        >
          <input
            type="text"
            value={rgpd.participante_nombre}
            onChange={(e) =>
              setRgpd((r) => ({ ...r, participante_nombre: e.target.value }))
            }
            placeholder="Nombre y apellidos del/de la participante"
            className={inputCls}
          />
        </Field>

        <Field label="Nombre y apellidos del familiar/tutor/a" requerido>
          <input
            type="text"
            value={rgpd.tutor_nombre}
            onChange={(e) =>
              setRgpd((r) => ({ ...r, tutor_nombre: e.target.value }))
            }
            placeholder="Nombre y apellidos de quien firma"
            className={inputCls}
          />
        </Field>

        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            Firma del familiar/tutor/a
          </div>
          <div className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 rounded-lg p-3">
            {textoAutorizacion('datos_imagen', {
              alumnoNombre:
                rgpd.participante_nombre.trim() || '[participante]',
              timestamp: new Date().toISOString(),
            })}
          </div>
          <SignatureCanvas
            ref={refDatosImagen}
            ariaLabel="Firma del familiar o tutor"
          />
          <button
            type="button"
            onClick={() => refDatosImagen.current?.clear()}
            className="text-xs text-red-600 hover:underline"
          >
            Limpiar firma
          </button>
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
          disabled={enviando}
          className={
            esModificacion
              ? 'rounded-lg bg-amber-700 text-white font-medium px-4 py-2.5 hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed'
              : 'rounded-lg bg-emerald-700 text-white font-medium px-4 py-2.5 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          {enviando
            ? esModificacion
              ? 'Confirmando…'
              : 'Enviando…'
            : esModificacion
              ? 'Confirmar cambios'
              : 'Enviar formulario'}
        </button>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

function Bloque({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}
function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-slate-900">{children}</h3>
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
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-900 text-right max-w-[60%]">{v}</dd>
    </div>
  )
}
