import { useEffect, useRef, useState } from 'react'
import {
  borrarArchivo,
  getUrlFirmada,
  subirArchivo,
} from './api'

type Props = {
  expedienteId: string
  fotoPath: string | null
  onChange: (path: string | null) => void
}

const MAX_BYTES = 5 * 1024 * 1024

export function FotoUpload({ expedienteId, fotoPath, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!fotoPath) {
      setPreview(null)
      return
    }
    getUrlFirmada(fotoPath)
      .then((url) => {
        if (!cancelled) setPreview(url)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [fotoPath])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Debe ser una imagen (JPG, PNG, etc.).')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('La imagen no puede pesar más de 5 MB.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const path = await subirArchivo(expedienteId, file, 'foto')
      if (fotoPath) await borrarArchivo(fotoPath)
      onChange(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async () => {
    if (!fotoPath) return
    setBusy(true)
    try {
      await borrarArchivo(fotoPath)
      onChange(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        Foto del/de la participante
      </label>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400 text-xs border border-slate-200">
          {preview ? (
            <img src={preview} alt="foto" className="w-full h-full object-cover" />
          ) : (
            'Sin foto'
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? 'Subiendo…' : fotoPath ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {fotoPath && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="text-xs text-red-600 hover:underline self-start"
            >
              Quitar foto
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={onPick}
          />
        </div>
      </div>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  )
}
