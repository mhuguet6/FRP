import type { SaveStatus } from '../../lib/useAutosave'

export function IndicadorGuardado({ status }: { status: SaveStatus }) {
  const map = {
    idle: { text: '', color: '' },
    saving: { text: 'Guardando…', color: 'text-slate-500' },
    saved: { text: 'Guardado ✓', color: 'text-emerald-600' },
    error: { text: 'Error al guardar', color: 'text-red-600' },
  }
  const { text, color } = map[status]
  if (!text) return <span className="text-xs invisible">.</span>
  return <span className={`text-xs ${color}`}>{text}</span>
}
