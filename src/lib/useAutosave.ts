import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type Options<T> = {
  data: T
  enabled: boolean
  delay?: number
  save: (data: T) => Promise<void>
  isEqual?: (a: T, b: T) => boolean
}

/**
 * Debounced autosave. Guarda `data` X ms después del último cambio.
 * Cancela el guardado pendiente si llega un nuevo cambio.
 * Hace flush al desmontar el componente si hay cambios sin guardar
 * (importante: avanzar a la siguiente sección no debe perder datos).
 */
export function useAutosave<T>({
  data,
  enabled,
  delay = 1500,
  save,
  isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b),
}: Options<T>): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const lastSavedRef = useRef<T | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const saveRef = useRef(save)
  saveRef.current = save
  const isEqualRef = useRef(isEqual)
  isEqualRef.current = isEqual

  // Programación del debounce
  useEffect(() => {
    if (!enabled) return
    if (lastSavedRef.current === null) {
      lastSavedRef.current = data
      return
    }
    if (isEqual(lastSavedRef.current, data)) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setStatus('saving')
      try {
        await saveRef.current(dataRef.current)
        lastSavedRef.current = dataRef.current
        setStatus('saved')
      } catch (e) {
        console.error('[autosave]', e)
        setStatus('error')
      }
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, enabled])

  // Flush al desmontar: si hay cambios pendientes sin guardar, dispara
  // el guardado inmediato (fire-and-forget porque el componente ya muere).
  useEffect(() => {
    return () => {
      const last = lastSavedRef.current
      const cur = dataRef.current
      if (last !== null && !isEqualRef.current(last, cur)) {
        saveRef.current(cur).catch((e) =>
          console.error('[autosave flush on unmount]', e)
        )
      }
    }
  }, [])

  return status
}
