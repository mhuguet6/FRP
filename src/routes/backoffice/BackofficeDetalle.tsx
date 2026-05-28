import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useStaffStatus } from '../../lib/useStaffStatus'
import {
  actualizarExpediente,
  anularPago,
  getDatosClienta,
  getExpediente,
  getUrlFirmada,
  registrarEvento,
  type EstadoExpediente,
  type Expediente,
} from '../../features/expediente/api'
import {
  decisionImagenLabel,
  requiereConfirmacionImagen,
} from '../../features/expediente/validacion'
import { useSession } from '../../lib/useSession'
import { PageSpinner } from '../../components/ui/PageSpinner'

type FirmaRow = {
  id: string
  tipo: string
  storage_path: string
  firmado_por: string
  texto_autorizacion: string
  firmado_at: string
  imagenUrl?: string
}
type DocumentoRow = {
  id: string
  tipo: string
  storage_path: string
  nombre_original: string | null
  size_bytes: number | null
  created_at: string
  url?: string
}
type EventoRow = {
  id: number
  tipo: string
  payload: Record<string, unknown>
  actor: string | null
  created_at: string
}

const estadoLabel: Record<string, string> = {
  creado: 'Sin empezar',
  en_progreso: 'En progreso',
  pendiente_de_firma: 'Falta firma',
  enviado: 'Enviado',
  validado: 'Validado',
  requiere_correccion: 'Necesita corrección',
  cerrado: 'Cerrado',
}

const firmaLabel: Record<string, string> = {
  datos_imagen: 'Protección de datos y derechos de imagen',
  vacunacion: 'Declaración de vacunación',
  medicacion: 'Autorización de medicación',
  reglamento_tutor: 'Conformidad con decálogo y reglamento',
}

export function BackofficeDetalle() {
  const { id } = useParams<{ id: string }>()
  const staff = useStaffStatus()
  const session = useSession()
  const [expediente, setExpediente] = useState<Expediente | null>(null)
  const [firmas, setFirmas] = useState<FirmaRow[]>([])
  const [documentos, setDocumentos] = useState<DocumentoRow[]>([])
  const [eventos, setEventos] = useState<EventoRow[]>([])
  const [datosClienta, setDatosClienta] = useState<Record<string, unknown> | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || staff.status !== 'staff') return
    ;(async () => {
      try {
        const exp = await getExpediente(id)
        setExpediente(exp)
        if (exp.foto_path) {
          getUrlFirmada(exp.foto_path).then(setFotoUrl).catch(() => {})
        }
        // Cargar datos privados de la clienta (chozo, importe, observaciones, etc.)
        getDatosClienta(id)
          .then(setDatosClienta)
          .catch(() => {})
        const [fRes, dRes, eRes] = await Promise.all([
          supabase
            .from('firmas')
            .select('id, tipo, storage_path, firmado_por, texto_autorizacion, firmado_at')
            .eq('expediente_id', id)
            .order('firmado_at', { ascending: true }),
          supabase
            .from('documentos')
            .select('id, tipo, storage_path, nombre_original, size_bytes, created_at')
            .eq('expediente_id', id)
            .order('created_at', { ascending: true }),
          supabase
            .from('eventos')
            .select('id, tipo, payload, actor, created_at')
            .eq('expediente_id', id)
            .order('created_at', { ascending: false })
            .limit(50),
        ])
        if (fRes.error) throw fRes.error
        if (dRes.error) throw dRes.error
        if (eRes.error) throw eRes.error

        const firmasConUrl = await Promise.all(
          (fRes.data ?? []).map(async (f) => ({
            ...f,
            imagenUrl: await urlFirmasBucket(f.storage_path),
          }))
        )
        const docsConUrl = await Promise.all(
          (dRes.data ?? []).map(async (d) => ({
            ...d,
            url: await getUrlFirmada(d.storage_path).catch(() => undefined),
          }))
        )
        setFirmas(firmasConUrl)
        setDocumentos(docsConUrl)
        setEventos(eRes.data ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar')
      }
    })()
  }, [id, staff.status])

  if (staff.status === 'loading' || (!expediente && !error)) return <PageSpinner />
  if (staff.status === 'not_staff') {
    return (
      <Centered>
        <p className="text-red-700 text-sm">No tienes acceso al backoffice.</p>
        <Link to="/" className="inline-block mt-3 text-slate-900 underline text-sm">
          Volver
        </Link>
      </Centered>
    )
  }
  if (error) {
    return (
      <Centered>
        <p className="text-red-700 text-sm">{error}</p>
        <Link to="/admin" className="inline-block mt-3 text-slate-900 underline text-sm">
          Volver al listado
        </Link>
      </Centered>
    )
  }
  if (!expediente) return null

  const r = (expediente.respuestas ?? {}) as Record<string, R>
  const s1 = r.seccion1 as R | undefined
  const s2 = r.seccion2 as R | undefined
  const s3 = r.seccion3 as R | undefined
  const s4 = r.seccion4 as R | undefined
  const s5 = r.seccion5 as R | undefined
  const s6 = r.seccion6 as R | undefined
  const s7 = r.seccion7 as R | undefined

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/admin"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Listado
          </Link>
          <div className="flex items-center gap-2">
            {expediente.programa === 'robotica' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-800">
                Robótica
              </span>
            )}
            {expediente.programa === 'emprendimiento' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                Emprendimiento
              </span>
            )}
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${estadoColor[expediente.estado] ?? 'bg-slate-100 text-slate-700'}`}
            >
              {estadoLabel[expediente.estado] ?? expediente.estado}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header con foto y datos principales */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex gap-4 items-start">
          <div className="w-24 h-24 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center text-slate-400 text-xs shrink-0">
            {fotoUrl ? (
              <img src={fotoUrl} alt="foto" className="w-full h-full object-cover" />
            ) : (
              'Sin foto'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900">
              {expediente.alumno_nombre} {expediente.alumno_apellidos}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {expediente.fecha_nacimiento &&
                `Nacido/a el ${new Date(expediente.fecha_nacimiento).toLocaleDateString('es-ES')} · `}
              {expediente.curso && `Curso: ${expediente.curso}`}
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Tutor/a: <strong>{expediente.tutor_nombre ?? '—'}</strong>
              {expediente.tutor_email && (
                <>
                  {' '}
                  · <a
                    href={`mailto:${expediente.tutor_email}`}
                    className="underline"
                  >
                    {expediente.tutor_email}
                  </a>
                </>
              )}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              ID: {expediente.id} · Creado{' '}
              {new Date(expediente.created_at).toLocaleString('es-ES')}
              {expediente.submitted_at && (
                <>
                  {' '}
                  · Enviado{' '}
                  {new Date(expediente.submitted_at).toLocaleString('es-ES')}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Aviso destacado: confirmación derechos de imagen pendiente */}
        {requiereConfirmacionImagen(expediente) && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 flex items-start gap-3">
            <div className="text-2xl shrink-0">⚠</div>
            <div className="flex-1">
              <div className="font-semibold text-amber-900">
                Confirmación de derechos de imagen pendiente
              </div>
              <p className="text-sm text-amber-900 mt-1">
                La familia ha marcado <strong>"{decisionImagenLabel(expediente)}"</strong>.
                Conviene contactar con ellos para explicarles que la
                comunicación del Campus va por la cuenta de Instagram y la web
                del programa, y confirmar que entienden que sus hijos/as no
                aparecerán en esas publicaciones.
              </p>
              <p className="text-xs text-amber-800 mt-2">
                Cuando lo hayas hecho, márcalo como confirmado abajo en el
                panel de gestión.
              </p>
            </div>
          </div>
        )}

        {expediente.imagen_confirmada_at && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-3 text-sm text-emerald-900">
            <span className="text-lg">✓</span>
            <span>
              Imagen confirmada por <strong>{expediente.imagen_confirmada_por ?? '—'}</strong>{' '}
              el {new Date(expediente.imagen_confirmada_at).toLocaleString('es-ES')}
            </span>
          </div>
        )}

        {/* Panel de gestión interna (solo staff) */}
        <PanelGestion
          expediente={expediente}
          staffEmail={
            session.status === 'authenticated'
              ? session.session.user.email ?? 'staff'
              : 'staff'
          }
          onUpdated={(updated) => setExpediente(updated)}
          onNuevoEvento={(ev) => setEventos((cur) => [ev, ...cur])}
        />

        {/* Edición de datos básicos (solo staff) */}
        <PanelEdicion
          expediente={expediente}
          staffEmail={
            session.status === 'authenticated'
              ? session.session.user.email ?? 'staff'
              : 'staff'
          }
          onUpdated={(updated) => setExpediente(updated)}
          onNuevoEvento={(ev) => setEventos((cur) => [ev, ...cur])}
        />

        {/* Datos privados de la clienta (chozo, importe, observaciones...) */}
        {datosClienta && Object.keys(datosClienta).length > 0 && (
          <BloqueDatosClienta datos={datosClienta} />
        )}

        {/* Sección 1 — Apartado A: datos del participante */}
        <Bloque titulo="Datos del participante">
          <Row k="Nombre y apellidos" v={`${expediente.alumno_nombre ?? ''} ${expediente.alumno_apellidos ?? ''}`} />
          <Row k="Fecha de nacimiento" v={expediente.fecha_nacimiento ?? '—'} />
          <Row
            k="Curso escolar"
            v={
              (s1?.curso as string | undefined) === 'Otros'
                ? `Otros — ${(s1?.curso_otro as string) ?? '—'}`
                : (s1?.curso as string | undefined) ?? '—'
            }
          />
        </Bloque>

        {/* Sección 1 — Apartado B: contacto a familiares */}
        <Bloque titulo="Contacto a familiares">
          <Row
            k="Relación familiar"
            v={(s1?.relacion_familiar as string | undefined) ?? '—'}
          />
          <Row k="Teléfono" v={(s1?.telefono as string | undefined) ?? '—'} />
          <Row k="Email" v={(s1?.email as string | undefined) ?? '—'} />
          <Row k="Dirección" v={(s1?.direccion as string) ?? '—'} />
          <Row
            k="Mejor día para llamar"
            v={(() => {
              const ds = (s1?.dias_llamada as string[] | undefined) ?? []
              // Compat con datos viejos cuando era string único
              const legacy = s1?.dia_llamada as string | undefined
              const arr = ds.length > 0 ? ds : legacy ? [legacy] : []
              if (arr.length === 0) return '—'
              return arr
                .map((d) =>
                  d === 'cualquiera' ? 'Cualquier día' : formatearFecha(d)
                )
                .join(', ')
            })()}
          />
          {((s1?.contactos_extra as Array<R> | undefined) ?? []).length > 0 && (
            <div className="mt-2">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Contactos adicionales
              </div>
              {((s1?.contactos_extra as Array<R> | undefined) ?? []).map(
                (c, i) => (
                  <div
                    key={i}
                    className="text-sm text-slate-900 mb-1 border-b border-slate-100 last:border-0 pb-1"
                  >
                    <strong>{i + 1}.</strong> {c.relacion as string} —{' '}
                    <a href={`tel:${c.telefono as string}`} className="underline">
                      {c.telefono as string}
                    </a>
                    {c.email ? ` · ${c.email as string}` : ''}
                    {(() => {
                      const ds = (c.dias_llamada as string[] | undefined) ?? []
                      const legacy = c.dia_llamada as string | undefined
                      const arr = ds.length > 0 ? ds : legacy ? [legacy] : []
                      if (arr.length === 0) return ''
                      return (
                        ' · ' +
                        arr
                          .map((d) =>
                            d === 'cualquiera'
                              ? 'Cualquier día'
                              : formatearFecha(d)
                          )
                          .join(', ')
                      )
                    })()}
                  </div>
                )
              )}
            </div>
          )}
        </Bloque>

        {/* Sección 2: familia y contactos */}
        <Bloque titulo="Familia y contactos">
          <Row k="DNI del tutor/a" v={expediente.tutor_dni ?? '—'} />
          <Row k="Email de contacto" v={expediente.tutor_email ?? '—'} />
          <div className="mt-2">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              Personas de contacto
            </div>
            {((s2?.contactos as Array<R> | undefined) ?? []).map((c, i) => (
              <div
                key={i}
                className="text-sm text-slate-900 mb-1 border-b border-slate-100 last:border-0 pb-1"
              >
                <strong>{i + 1}.</strong> {c.nombre as string} ({c.relacion as string}) —{' '}
                <a href={`tel:${c.telefono as string}`} className="underline">
                  {c.telefono as string}
                </a>
              </div>
            ))}
          </div>
        </Bloque>

        {/* Sección 3: salud */}
        <Bloque titulo="Salud">
          <RowNoSi
            k="Situación familiar relevante"
            v={s3?.situacion_familiar as R | undefined}
          />
          <RowAntecedentes v={s3?.antecedentes_medicos as R | undefined} />
          <RowAlergias v={s3?.alergias as R | undefined} />
          <RowNoSi k="Mareos" v={s3?.mareos as R | undefined} />
          <Row
            k="Alimentación"
            v={
              ((s3?.alimentacion as R | undefined)?.come as string | undefined) ??
              '—'
            }
          />
          <RowNoSi
            k="Dieta especial"
            v={(s3?.alimentacion as R | undefined)?.dieta as R | undefined}
          />
          <Row
            k="Peso (kg)"
            v={(s3?.alimentacion as R | undefined)?.peso_kg as string | undefined}
          />
          <Row
            k="Experiencia en colonias"
            v={(s3?.experiencia_colonias as R | undefined)?.veces as string | undefined}
          />
          <RowPatologias v={s3?.patologias as R | undefined} />
          <RowCovid v={s3?.covid as R | undefined} />
          <RowNoSi k="Discapacidad" v={s3?.discapacidad as R | undefined} />
          <RowNoSi k="Movilidad" v={s3?.movilidad as R | undefined} />
          <RowNoSi k="Motricidad" v={s3?.motricidad as R | undefined} />
          <RowNoSi k="Gafas o lentillas" v={s3?.gafas_lentillas as R | undefined} />
          <RowNoSi k="Aparatos bucales" v={s3?.aparatos_bucales as R | undefined} />
          <RowNoSi k="Miedos" v={s3?.miedos as R | undefined} />
          <RowNoSi k="Carácter" v={s3?.caracter as R | undefined} />
          <RowNoSi k="Atención especial" v={s3?.atencion_especial as R | undefined} />
          <Row
            k="Vacunación"
            v={
              (s3?.vacunacion as R | undefined)?.opcion === '1'
                ? 'Opción 1 — declaración (firmada al final)'
                : (s3?.vacunacion as R | undefined)?.opcion === '2'
                  ? 'Opción 2 — certificado médico adjunto'
                  : '—'
            }
          />
        </Bloque>

        {/* Sección 4: medicación */}
        <Bloque titulo="Medicación">
          <Row
            k="Medicación habitual"
            v={(s4?.habitual as R | undefined)?.respuesta as string | undefined}
          />
          {((s4?.habitual as R | undefined)?.medicamentos as
            | Array<R>
            | undefined)?.map((m, i) => {
            const hor = fmtHorarioMed(m)
            return (
              <div key={i} className="text-sm text-slate-700 ml-4">
                • <strong>{m.nombre as string}</strong>
                {m.dosis ? ` — ${m.dosis as string}` : ''}
                {hor ? ` (${hor})` : ''}
              </div>
            )
          })}
          <Row
            k="Medicación durante el Campus"
            v={(s4?.durante_campus as R | undefined)?.respuesta as string | undefined}
          />
          {((s4?.durante_campus as R | undefined)?.medicamentos as
            | Array<R>
            | undefined)?.map((m, i) => {
            const hor = fmtHorarioMed(m)
            return (
              <div key={i} className="text-sm text-slate-700 ml-4">
                • <strong>{m.nombre as string}</strong>
                {m.dosis ? ` — ${m.dosis as string}` : ''}
                {hor ? ` (${hor})` : ''}
                {m.indicaciones ? ` · ${m.indicaciones as string}` : ''}
              </div>
            )
          })}
          <Row
            k="Receta médica adjunta"
            v={(s4?.durante_campus as R | undefined)?.receta_adjunta as string | undefined}
          />
        </Bloque>

        {/* Sección 5: conociéndote (collapsible) */}
        <BloqueColapsable titulo="Conociéndote (preguntas largas)">
          <ConociendoteParticipante v={s5?.participante as R | undefined} />
          <div className="my-3 border-t border-slate-200" />
          <ConociendoteFamilia v={s5?.familia as R | undefined} />
        </BloqueColapsable>

        {/* Sección 6: decálogo de convivencia */}
        <Bloque titulo="Decálogo de convivencia">
          <RowNoSi
            k="Observaciones para el equipo"
            v={s6?.observaciones_generales as R | undefined}
          />
          <Row
            k="Decálogo leído"
            v={(s6?.decalogo_leido as boolean | undefined) ? 'Sí' : 'No'}
          />
          <Row
            k="Reglamento aceptado"
            v={
              (s6?.reglamento_leido as boolean | undefined) &&
              (s6?.reglamento_acepto_normas as boolean | undefined) &&
              (s6?.reglamento_entiendo_consecuencias as boolean | undefined)
                ? 'Sí (3 confirmaciones)'
                : 'Incompleto'
            }
          />
          <Row
            k="Nombre escrito por el/la participante"
            v={(s6?.firma_nino_nombre as string | undefined) ?? '—'}
          />
        </Bloque>

        {/* Sección 7: derechos de imagen, datos y firma del tutor */}
        <Bloque titulo="Derechos de imagen y datos">
          <Row
            k="Excluye correo electrónico"
            v={
              (s7?.comunicaciones as R | undefined)?.no_email === true
                ? 'Sí'
                : 'No'
            }
          />
          <Row
            k="Excluye correo postal"
            v={
              (s7?.comunicaciones as R | undefined)?.no_postal === true
                ? 'Sí'
                : 'No'
            }
          />
          <Row
            k="Autoriza uso de imágenes"
            v={
              (s7?.imagen as R | undefined)?.no_autorizo === true
                ? 'No autoriza'
                : 'Sí'
            }
          />
          <Row
            k="Nombre del/de la participante"
            v={(s7?.participante_nombre as string | undefined) ?? '—'}
          />
          <Row
            k="Nombre del familiar/tutor que firma"
            v={(s7?.tutor_nombre as string | undefined) ?? '—'}
          />
        </Bloque>

        <Bloque titulo={`Firmas (${firmas.length})`}>
          {firmas.length === 0 ? (
            <p className="text-sm text-slate-500">Sin firmas todavía.</p>
          ) : (
            <div className="space-y-3">
              {firmas.map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-slate-200 p-4 space-y-2"
                >
                  <div className="text-sm font-medium text-slate-900">
                    {firmaLabel[f.tipo] ?? f.tipo}
                  </div>
                  <div className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 rounded p-2">
                    {f.texto_autorizacion}
                  </div>
                  {f.imagenUrl ? (
                    <img
                      src={f.imagenUrl}
                      alt={f.tipo}
                      className="bg-white border border-slate-200 rounded max-h-32"
                    />
                  ) : (
                    <p className="text-xs text-slate-500">Imagen no disponible</p>
                  )}
                  <p className="text-xs text-slate-500">
                    Firmado por <strong>{f.firmado_por}</strong> el{' '}
                    {new Date(f.firmado_at).toLocaleString('es-ES')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Bloque>

        <Bloque titulo={`Documentos adjuntos (${documentos.length})`}>
          {documentos.length === 0 ? (
            <p className="text-sm text-slate-500">Sin documentos adjuntos.</p>
          ) : (
            <ul className="space-y-2">
              {documentos.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-2"
                >
                  <div>
                    <strong>{d.tipo}</strong>
                    {d.nombre_original && (
                      <span className="text-slate-500"> — {d.nombre_original}</span>
                    )}
                    <div className="text-xs text-slate-500">
                      {new Date(d.created_at).toLocaleString('es-ES')}
                    </div>
                  </div>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-900 underline text-xs whitespace-nowrap"
                    >
                      Ver archivo
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <BloqueColapsable titulo={`Historial (${eventos.length})`}>
          {eventos.length === 0 ? (
            <p className="text-sm text-slate-500">Sin eventos.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {eventos.map((e) => (
                <li key={e.id} className="text-slate-700">
                  <span className="text-slate-500">
                    {new Date(e.created_at).toLocaleString('es-ES')}
                  </span>{' '}
                  · <strong>{e.tipo}</strong>
                  {e.actor && (
                    <span className="text-slate-500"> ({e.actor})</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </BloqueColapsable>
      </main>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

async function urlFirmasBucket(path: string): Promise<string | undefined> {
  const { data, error } = await supabase.storage
    .from('firmas')
    .createSignedUrl(path, 60 * 10)
  if (error) return undefined
  return data.signedUrl
}

function formatearFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function fmtHorarioMed(m: R): string {
  const horarios = Array.isArray(m.horarios) ? (m.horarios as string[]) : []
  const partes: string[] = []
  if (horarios.length > 0) partes.push(horarios.join(', '))
  if (m.prn === true) partes.push('según necesidad')
  if (partes.length > 0) return partes.join(' + ')
  // Compat con datos antiguos en texto libre.
  return typeof m.frecuencia === 'string' ? m.frecuencia.trim() : ''
}

const estadoColor: Record<string, string> = {
  creado: 'bg-slate-100 text-slate-700',
  en_progreso: 'bg-blue-50 text-blue-700',
  pendiente_de_firma: 'bg-amber-50 text-amber-800',
  enviado: 'bg-emerald-50 text-emerald-800',
  validado: 'bg-emerald-100 text-emerald-900',
  requiere_correccion: 'bg-red-50 text-red-700',
  cerrado: 'bg-slate-200 text-slate-700',
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-6 max-w-md w-full text-center">
        {children}
      </div>
    </div>
  )
}

function Bloque({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
      <h2 className="text-base font-semibold text-slate-900 mb-2">{titulo}</h2>
      {children}
    </div>
  )
}

function BloqueColapsable({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex items-center justify-between w-full text-base font-semibold text-slate-900"
      >
        <span>{titulo}</span>
        <span className="text-sm text-slate-500">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && <div className="space-y-2 pt-2">{children}</div>}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string | undefined | null }) {
  const shown = v && v.trim() ? v : '—'
  return (
    <div className="flex items-baseline gap-3 text-sm border-b border-slate-100 last:border-0 py-1">
      <dt className="text-slate-500 w-1/3 shrink-0">{k}</dt>
      <dd className="text-slate-900 flex-1 break-words">{shown}</dd>
    </div>
  )
}

function RowNoSi({ k, v }: { k: string; v: R | undefined }) {
  if (!v?.respuesta) return <Row k={k} v={undefined} />
  if (v.respuesta === 'no') return <Row k={k} v="No" />
  const detalle = (v.detalle as string | undefined) ?? ''
  return <Row k={k} v={`Sí${detalle ? ` — ${detalle}` : ''}`} />
}

function RowAlergias({ v }: { v: R | undefined }) {
  if (!v?.respuesta) return <Row k="Alergias" v={undefined} />
  if (v.respuesta === 'no') return <Row k="Alergias" v="No" />
  const que = (v.que as string | undefined) ?? ''
  const reaccion = (v.reaccion as string | undefined) ?? ''
  return (
    <Row k="Alergias" v={`Sí — ${que}${reaccion ? ` (reacción: ${reaccion})` : ''}`} />
  )
}

function RowAntecedentes({ v }: { v: R | undefined }) {
  if (!v?.respuesta) return <Row k="Antecedentes médicos" v={undefined} />
  if (v.respuesta === 'no') return <Row k="Antecedentes médicos" v="No" />
  const tipos = ((v.tipos as string[] | undefined) ?? []).join(', ')
  const otras = (v.otras as string | undefined) ?? ''
  const comentarios = (v.comentarios as string | undefined) ?? ''
  const parts = [tipos, otras, comentarios].filter((p) => p.trim().length > 0)
  return (
    <Row k="Antecedentes médicos" v={`Sí — ${parts.join('; ')}`} />
  )
}

function RowPatologias({ v }: { v: R | undefined }) {
  if (!v?.respuesta) return <Row k="Patologías frecuentes" v={undefined} />
  if (v.respuesta === 'no') return <Row k="Patologías frecuentes" v="No" />
  const tipos = ((v.tipos as string[] | undefined) ?? []).join(', ')
  const otros = (v.otros as string | undefined) ?? ''
  const parts = [tipos, otros].filter((p) => p.trim().length > 0)
  return <Row k="Patologías frecuentes" v={`Sí — ${parts.join('; ')}`} />
}

function RowCovid({ v }: { v: R | undefined }) {
  const info = v?.info as R | undefined
  const dosis = v?.dosis as string | undefined
  let infoStr = '—'
  if (info?.respuesta === 'no') infoStr = 'No'
  else if (info?.respuesta === 'si')
    infoStr = `Sí${info.detalle ? ` — ${info.detalle}` : ''}`
  return (
    <Row k="COVID-19" v={`${infoStr}${dosis ? ` · ${dosis} dosis` : ''}`} />
  )
}

function ConociendoteParticipante({ v }: { v: R | undefined }) {
  if (!v) return <p className="text-sm text-slate-500">Sin respuestas.</p>
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">
        Sobre el/la participante
      </h3>
      <Row k="Sobrenombre" v={v.sobrenombre as string | undefined} />
      <Row k="Curso (sept)" v={v.curso as string | undefined} />
      <Row k="Actividades deseadas" v={v.actividades_deseadas as string | undefined} />
      <Row k="Buen monitor" v={v.buen_monitor as string | undefined} />
      <Row k="Por qué ser su amigo" v={v.amigo_de_ti as string | undefined} />
      <RowMusica v={v.musica as R | undefined} />
      <RowNoSi k="Deportes" v={v.deportes as R | undefined} />
      <Row k="Libros favoritos" v={v.libros as string | undefined} />
      <Row k="Comida favorita" v={v.comida as string | undefined} />
      <Row k="Aficiones" v={v.aficiones as string | undefined} />
      <RowNoSi k="Toca instrumento" v={v.instrumento as R | undefined} />
      <Row k="Habitación" v={v.habitacion as string | undefined} />
      <RowNoSi k="Talento especial" v={v.talento as R | undefined} />
      <Row k="Profesión soñada" v={v.profesion_sonada as string | undefined} />
      <Row k="Empresa favorita" v={v.empresa_favorita as string | undefined} />
      <Row k="Le emociona" v={v.emociona as string | undefined} />
      <Row k="Difícil no tener" v={v.dificil_no_tener as string | undefined} />
      <Row k="Otras notas" v={v.extra as string | undefined} />
      {v.emprendimiento && (
        <Row k="(Emprendimiento) Idea de empresa" v={v.emprendimiento as string} />
      )}
    </div>
  )
}

function ConociendoteFamilia({ v }: { v: R | undefined }) {
  if (!v) return null
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">
        Sobre la familia
      </h3>
      <RowNoSi k="¿Le gusta el deporte?" v={v.deporte as R | undefined} />
      <RowNoSi k="Aire libre" v={v.aire_libre as R | undefined} />
      <RowNoSi k="Arte/música/teatro" v={v.arte as R | undefined} />
      <Row k="Hábitos alimentarios" v={v.alimentacion_casa as string | undefined} />
      <Row
        k="Socialmente"
        v={
          v.social === 'otro'
            ? `Otro — ${(v.social_otro as string | undefined) ?? ''}`
            : (v.social as string | undefined)
        }
      />
      <Row k="Cómo duerme" v={v.duerme as string | undefined} />
      <Row k="Materia preferida" v={v.materia_preferida as string | undefined} />
      <RowNoSi k="Temor" v={v.temor as R | undefined} />
      <RowNoSi k="Salud física" v={v.salud_fisica as R | undefined} />
      <RowNoSi k="Salud emocional" v={v.salud_emocional as R | undefined} />
      <RowNoSi k="Condición de salud" v={v.condicion_salud as R | undefined} />
      <Row k="Familia única" v={v.familia_unica as string | undefined} />
      <RowNoSi k="Espíritu emprendedor" v={v.emprendedor as R | undefined} />
      <Row k="Difícil ser niño/a hoy" v={v.dificil_ser_nino as string | undefined} />
      <Row k="Tradición familiar" v={v.tradicion_favorita as string | undefined} />
      <Row k="Motivación Campus" v={v.motivacion_campus as string | undefined} />
      <RowNoSi k="Pregunta al equipo" v={v.pregunta_equipo as R | undefined} />
      <Row
        k="Dispositivos electrónicos"
        v={v.dispositivos_electronicos as string | undefined}
      />
      <Row k="Por qué Campus FRP" v={v.por_que_frp as string | undefined} />
      <RowNoSi k="Otras notas" v={v.extra as R | undefined} />
      {v.emprendimiento && (
        <Row k="(Emprendimiento) Expectativas" v={v.emprendimiento as string} />
      )}
    </div>
  )
}

function RowMusica({ v }: { v: R | undefined }) {
  if (!v?.respuesta) return <Row k="Música" v={undefined} />
  if (v.respuesta === 'no') return <Row k="Música" v="No" />
  const tipo = (v.tipo as string | undefined) ?? ''
  const artistas = (v.artistas as string | undefined) ?? ''
  const parts = [tipo, artistas ? `Artistas: ${artistas}` : ''].filter(Boolean)
  return <Row k="Música" v={`Sí — ${parts.join(', ')}`} />
}

// ----------------------------------------------------------------------------
// Panel de gestión interna
// ----------------------------------------------------------------------------

const ESTADOS_STAFF: Array<{ value: EstadoExpediente; label: string }> = [
  { value: 'enviado', label: 'Enviado (pendiente revisión)' },
  { value: 'validado', label: 'Validado' },
  { value: 'requiere_correccion', label: 'Requiere corrección (vuelve a familia)' },
  { value: 'cerrado', label: 'Cerrado' },
  { value: 'en_progreso', label: 'En progreso (re-abrir)' },
]

function PanelGestion({
  expediente,
  staffEmail,
  onUpdated,
  onNuevoEvento,
}: {
  expediente: Expediente
  staffEmail: string
  onUpdated: (e: Expediente) => void
  onNuevoEvento: (ev: EventoRow) => void
}) {
  const [estadoSel, setEstadoSel] = useState<EstadoExpediente>(expediente.estado)
  const [observaciones, setObservaciones] = useState(
    expediente.observaciones_internas ?? ''
  )
  const [guardando, setGuardando] = useState(false)
  const [confirmandoImagen, setConfirmandoImagen] = useState(false)
  const [anulandoPago, setAnulandoPago] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const sucio =
    estadoSel !== expediente.estado ||
    observaciones !== (expediente.observaciones_internas ?? '')

  const pendienteImagen = requiereConfirmacionImagen(expediente)
  const puedeAnularPago =
    expediente.tipo === 'estudiante' && !!expediente.pagado_at

  const onAnularPago = async () => {
    const aviso = expediente.formulario_enviado_at
      ? '¿Anular el pago? OJO: el formulario ya se ha enviado a la familia. Aún así puedes revertir la confirmación de pago.'
      : '¿Anular la confirmación de pago de este expediente?'
    if (!confirm(aviso)) return
    setAnulandoPago(true)
    setError(null)
    try {
      await anularPago(expediente.id, staffEmail)
      const ahora = new Date().toISOString()
      onUpdated({
        ...expediente,
        pagado_at: null,
        pagado_por: null,
      })
      onNuevoEvento({
        id: Date.now(),
        tipo: 'pago_revertido',
        payload: { por: staffEmail },
        actor: staffEmail,
        created_at: ahora,
      })
      setOk('Confirmación de pago anulada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular el pago')
    } finally {
      setAnulandoPago(false)
    }
  }

  const onConfirmarImagen = async () => {
    setConfirmandoImagen(true)
    setError(null)
    try {
      const ahora = new Date().toISOString()
      const patch: Partial<Expediente> = {
        imagen_confirmada_at: ahora,
        imagen_confirmada_por: staffEmail,
      }
      await actualizarExpediente(expediente.id, patch)
      await registrarEvento(
        expediente.id,
        'imagen_confirmada',
        { decision: decisionImagenLabel(expediente) ?? null },
        staffEmail
      )
      onUpdated({ ...expediente, ...patch })
      onNuevoEvento({
        id: Date.now(),
        tipo: 'imagen_confirmada',
        payload: {},
        actor: staffEmail,
        created_at: ahora,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar')
    } finally {
      setConfirmandoImagen(false)
    }
  }

  const onGuardar = async () => {
    setGuardando(true)
    setError(null)
    setOk(null)
    try {
      const patch: Partial<Expediente> = {}
      const cambios: string[] = []
      if (estadoSel !== expediente.estado) {
        patch.estado = estadoSel
        cambios.push(`estado ${expediente.estado} → ${estadoSel}`)
      }
      if (observaciones !== (expediente.observaciones_internas ?? '')) {
        patch.observaciones_internas = observaciones || null
        cambios.push('observaciones internas')
      }
      if (Object.keys(patch).length === 0) {
        setOk('Sin cambios')
        return
      }

      await actualizarExpediente(expediente.id, patch)

      // Registrar evento de auditoría
      if (estadoSel !== expediente.estado) {
        await registrarEvento(
          expediente.id,
          'cambio_estado',
          { desde: expediente.estado, hacia: estadoSel },
          staffEmail
        )
      }
      if (observaciones !== (expediente.observaciones_internas ?? '')) {
        await registrarEvento(
          expediente.id,
          'observaciones_actualizadas',
          { longitud: observaciones.length },
          staffEmail
        )
      }

      // Recargar para tener updated_at fresco
      onUpdated({ ...expediente, ...patch })
      onNuevoEvento({
        id: Date.now(),
        tipo: cambios.join(' + '),
        payload: {},
        actor: staffEmail,
        created_at: new Date().toISOString(),
      })
      setOk('Guardado')
      setTimeout(() => setOk(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-amber-900">
          Gestión interna
        </h2>
        <span className="text-xs text-amber-700">solo staff</span>
      </div>

      {puedeAnularPago && (
        <div className="rounded-lg bg-white border border-red-300 p-3 space-y-2">
          <div className="text-sm font-medium text-red-900">
            Pago confirmado
          </div>
          <p className="text-xs text-red-800">
            Este expediente está marcado como pagado el{' '}
            <strong>
              {new Date(expediente.pagado_at as string).toLocaleString('es-ES')}
            </strong>
            {expediente.pagado_por ? ` por ${expediente.pagado_por}` : ''}. Si
            fue un error, puedes anularlo.
          </p>
          <button
            type="button"
            onClick={onAnularPago}
            disabled={anulandoPago}
            className="text-sm font-medium rounded-lg bg-white text-red-700 border border-red-300 px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
          >
            {anulandoPago ? 'Anulando…' : '✗ Anular confirmación de pago'}
          </button>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Estado del expediente
        </label>
        <select
          value={estadoSel}
          onChange={(e) => setEstadoSel(e.target.value as EstadoExpediente)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
        >
          {ESTADOS_STAFF.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {estadoSel === 'requiere_correccion' && (
          <p className="text-xs text-amber-800 mt-1">
            Al marcar "Requiere corrección", la familia podrá volver a editar
            el formulario y reenviarlo. Conviene escribir en observaciones qué
            debe corregir (aunque la familia no lo verá; tendrás que
            comunicárselo por separado).
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Observaciones internas (no visibles a la familia)
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={4}
          placeholder="Notas para el equipo: qué falta, qué validar, contexto especial…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
        />
      </div>

      {pendienteImagen && (
        <div className="rounded-lg bg-white border border-amber-300 p-3 space-y-2">
          <div className="text-sm font-medium text-amber-900">
            Confirmación de derechos de imagen
          </div>
          <p className="text-xs text-amber-800">
            Marca esta confirmación una vez hayas hablado con la familia y
            entiendan las implicaciones.
          </p>
          <button
            type="button"
            onClick={onConfirmarImagen}
            disabled={confirmandoImagen}
            className="text-sm font-medium rounded-lg bg-amber-700 text-white px-3 py-1.5 hover:bg-amber-800 disabled:opacity-50"
          >
            {confirmandoImagen
              ? 'Guardando…'
              : '✓ Marcar imagen como confirmada'}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-amber-800">
          {ok ? <span className="text-emerald-700">✓ {ok}</span> : null}
        </div>
        <button
          type="button"
          onClick={onGuardar}
          disabled={guardando || !sucio}
          className="rounded-lg bg-amber-700 text-white text-sm font-medium px-4 py-2 hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Panel de edición de datos básicos (solo staff)
// ----------------------------------------------------------------------------

type EdicionForm = {
  alumno_nombre: string
  alumno_apellidos: string
  fecha_nacimiento: string
  direccion: string
  programa: '' | 'robotica' | 'emprendimiento'
  tutor_nombre: string
  tutor_dni: string
  tutor_email: string
  tutor_telefono: string
}

function PanelEdicion({
  expediente,
  staffEmail,
  onUpdated,
  onNuevoEvento,
}: {
  expediente: Expediente
  staffEmail: string
  onUpdated: (e: Expediente) => void
  onNuevoEvento: (ev: EventoRow) => void
}) {
  const s1 = (expediente.respuestas?.seccion1 as R | undefined) ?? {}

  const valoresIniciales = (): EdicionForm => ({
    alumno_nombre: expediente.alumno_nombre ?? '',
    alumno_apellidos: expediente.alumno_apellidos ?? '',
    fecha_nacimiento: expediente.fecha_nacimiento ?? '',
    direccion: (s1.direccion as string | undefined) ?? '',
    programa: (expediente.programa as EdicionForm['programa']) ?? '',
    tutor_nombre: expediente.tutor_nombre ?? '',
    tutor_dni: expediente.tutor_dni ?? '',
    tutor_email: expediente.tutor_email ?? '',
    tutor_telefono: expediente.tutor_telefono ?? '',
  })

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<EdicionForm>(valoresIniciales)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cambio = (k: keyof EdicionForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((cur) => ({ ...cur, [k]: e.target.value }))

  const onCancelar = () => {
    setForm(valoresIniciales())
    setEditando(false)
    setError(null)
    setOk(null)
  }

  const onGuardar = async () => {
    setError(null)
    setOk(null)
    if (!form.alumno_nombre.trim() || !form.alumno_apellidos.trim()) {
      setError('Nombre y apellidos son obligatorios.')
      return
    }
    if (!form.tutor_email.trim()) {
      setError('El email del tutor es obligatorio.')
      return
    }
    setGuardando(true)
    try {
      // Combinamos respuestas existentes con los campos editables que
      // viven en jsonb (direccion). El resto son columnas tipadas.
      const nuevasRespuestas: Record<string, unknown> = {
        ...(expediente.respuestas as Record<string, unknown>),
        seccion1: {
          ...(s1 as Record<string, unknown>),
          nombre: form.alumno_nombre.trim(),
          apellidos: form.alumno_apellidos.trim(),
          fecha_nacimiento: form.fecha_nacimiento,
          direccion: form.direccion.trim(),
        },
        seccion2: {
          ...((expediente.respuestas?.seccion2 as Record<string, unknown>) ?? {}),
          tutor_nombre: form.tutor_nombre.trim(),
          email_contacto: form.tutor_email.trim(),
        },
      }
      const patch: Partial<Expediente> = {
        alumno_nombre: form.alumno_nombre.trim() || null,
        alumno_apellidos: form.alumno_apellidos.trim() || null,
        fecha_nacimiento: form.fecha_nacimiento || null,
        programa: form.programa || null,
        tutor_nombre: form.tutor_nombre.trim() || null,
        tutor_dni: form.tutor_dni.trim() || null,
        tutor_email: form.tutor_email.trim() || null,
        tutor_telefono: form.tutor_telefono.trim() || null,
        respuestas: nuevasRespuestas,
      }
      await actualizarExpediente(expediente.id, patch)
      await registrarEvento(
        expediente.id,
        'datos_editados',
        { por: staffEmail },
        staffEmail
      )
      const actualizado = { ...expediente, ...patch } as Expediente
      onUpdated(actualizado)
      onNuevoEvento({
        id: Date.now(),
        tipo: 'datos_editados',
        payload: { por: staffEmail },
        actor: staffEmail,
        created_at: new Date().toISOString(),
      })
      setOk('Datos actualizados.')
      setEditando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (!editando) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Editar expediente
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Edición rápida de datos básicos, o formulario completo (todas las
            secciones).
          </p>
          {ok && <p className="text-xs text-emerald-700 mt-1">✓ {ok}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setForm(valoresIniciales())
              setEditando(true)
              setOk(null)
            }}
            className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-50"
          >
            ✎ Datos básicos
          </button>
          <Link
            to={`/admin/expediente/${expediente.id}/editar`}
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800"
          >
            ✎ Formulario completo →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          Editar datos básicos
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Campo label="Nombre">
          <input
            type="text"
            className={inputClsEdit}
            value={form.alumno_nombre}
            onChange={cambio('alumno_nombre')}
          />
        </Campo>
        <Campo label="Apellidos">
          <input
            type="text"
            className={inputClsEdit}
            value={form.alumno_apellidos}
            onChange={cambio('alumno_apellidos')}
          />
        </Campo>
        <Campo label="Fecha de nacimiento">
          <input
            type="date"
            className={inputClsEdit}
            value={form.fecha_nacimiento}
            onChange={cambio('fecha_nacimiento')}
          />
        </Campo>
        <Campo label="Programa">
          <select
            className={inputClsEdit}
            value={form.programa}
            onChange={cambio('programa')}
          >
            <option value="">— Sin programa</option>
            <option value="robotica">Robótica</option>
            <option value="emprendimiento">Emprendimiento</option>
          </select>
        </Campo>
        <Campo label="Dirección">
          <input
            type="text"
            className={inputClsEdit}
            value={form.direccion}
            onChange={cambio('direccion')}
          />
        </Campo>
        <Campo label="Tutor/a (nombre)">
          <input
            type="text"
            className={inputClsEdit}
            value={form.tutor_nombre}
            onChange={cambio('tutor_nombre')}
          />
        </Campo>
        <Campo label="DNI / NIE del tutor">
          <input
            type="text"
            className={inputClsEdit}
            value={form.tutor_dni}
            onChange={cambio('tutor_dni')}
          />
        </Campo>
        <Campo label="Email del tutor">
          <input
            type="email"
            inputMode="email"
            className={inputClsEdit}
            value={form.tutor_email}
            onChange={cambio('tutor_email')}
          />
        </Campo>
        <Campo label="Teléfono del tutor">
          <input
            type="tel"
            className={inputClsEdit}
            value={form.tutor_telefono}
            onChange={cambio('tutor_telefono')}
          />
        </Campo>
      </div>

      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
        Esta edición se registra como evento <code>datos_editados</code> en el
        historial. Si el formulario ya fue enviado por la familia, modifica solo
        lo imprescindible.
      </p>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
        <div className="text-sm">
          {error ? <span className="text-red-700">{error}</span> : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={guardando}
            className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando}
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputClsEdit =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900'

function Campo({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-0.5">
        {label}
      </label>
      {children}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Bloque "Datos de la clienta" — chozo, importe, observaciones, etc.
// Lo aportó la clienta al crear el expediente. No es visible a la familia.
// ----------------------------------------------------------------------------

const ETIQUETAS_DATOS_CLIENTA: Record<string, string> = {
  genero: 'Género',
  edad: 'Edad',
  chozo: 'Chozo / habitación',
  repetidor: 'Repetidor/a',
  centro_educativo: 'Centro educativo',
  padres: 'Padres / tutores',
  profesiones: 'Profesiones',
  importe: 'Importe',
  observaciones: 'Observaciones',
  notas: 'Notas',
}

function BloqueDatosClienta({ datos }: { datos: Record<string, unknown> }) {
  const obs = (datos.observaciones ?? datos.notas) as string | undefined
  // El resto (excluyendo observaciones para no duplicar)
  const otros = Object.entries(datos).filter(
    ([k, v]) =>
      k !== 'observaciones' &&
      k !== 'notas' &&
      v !== null &&
      v !== undefined &&
      String(v).trim() !== ''
  )
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          Datos de la clienta
        </h2>
        <span className="text-[10px] text-slate-500">
          Privado, no visible a la familia
        </span>
      </div>
      {obs && obs.trim() && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <div className="text-xs font-medium text-amber-900 mb-1">
            Observaciones
          </div>
          <div className="text-sm text-amber-900 whitespace-pre-wrap">{obs}</div>
        </div>
      )}
      {otros.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {otros.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 text-sm">
              <span className="text-slate-500 min-w-[120px]">
                {ETIQUETAS_DATOS_CLIENTA[k] ?? k}
              </span>
              <span className="text-slate-900">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
