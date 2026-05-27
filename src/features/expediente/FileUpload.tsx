import { useEffect, useRef, useState } from 'react'
import { borrarArchivo, getUrlFirmada, subirArchivo } from './api'

type Props = {
  expedienteId: string
  carpeta: string
  path: string | null
  onChange: (path: string | null) => void
  accept?: string
  maxBytes?: number
  emptyLabel?: string
}

const DEFAULT_MAX = 10 * 1024 * 1024
const DEFAULT_ACCEPT = 'image/*,.pdf'

export function FileUpload({
  expedienteId,
  carpeta,
  path,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX,
  emptyLabel = '+ Subir archivo (foto o PDF)',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!path) {
      setPreviewUrl(null)
      return
    }
    getUrlFirmada(path)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url)
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const maxMb = Math.round(maxBytes / 1024 / 1024)
    if (file.size > maxBytes) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      setError(
        `Eh, máximo ${maxMb} MB. Este archivo pesa ${mb} MB y es demasiado grande.`
      )
      return
    }
    setError(null)
    setBusy(true)
    try {
      const newPath = await subirArchivo(expedienteId, file, carpeta)
      if (path) await borrarArchivo(path)
      onChange(newPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async () => {
    if (!path) return
    setBusy(true)
    try {
      await borrarArchivo(path)
      onChange(null)
    } finally {
      setBusy(false)
    }
  }

  const filename = path?.split('/').pop() ?? ''
  const esPdf = filename.toLowerCase().endsWith('.pdf')

  return (
    <div>
      {path ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
          <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-500 text-xs">
            {esPdf ? 'PDF' : 'IMG'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-900 truncate">Archivo subido</div>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-600 underline"
              >
                Ver archivo
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-xs text-slate-700 hover:underline"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="text-xs text-red-600 hover:underline"
          >
            Quitar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-lg border border-dashed border-slate-300 text-slate-600 font-medium py-3 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? 'Subiendo…' : emptyLabel}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onPick}
      />
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  )
}
