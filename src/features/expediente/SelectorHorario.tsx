// Selector de horas en intervalos de 1h (07:00–22:00) con multi-selección
// + opción "Según necesidad" (PRN).

export const HORAS_DISPONIBLES: string[] = Array.from({ length: 16 }, (_, i) =>
  `${String(7 + i).padStart(2, '0')}:00`
)

export function SelectorHorario({
  horarios,
  prn,
  onChangeHorarios,
  onChangePrn,
}: {
  horarios: string[]
  prn: boolean
  onChangeHorarios: (h: string[]) => void
  onChangePrn: (v: boolean) => void
}) {
  const seleccionadas = new Set(horarios)
  const toggle = (h: string) => {
    const next = new Set(seleccionadas)
    if (next.has(h)) next.delete(h)
    else next.add(h)
    onChangeHorarios(Array.from(next).sort())
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {HORAS_DISPONIBLES.map((h) => {
          const activo = seleccionadas.has(h)
          return (
            <button
              key={h}
              type="button"
              aria-pressed={activo}
              onClick={() => toggle(h)}
              className={
                activo
                  ? 'rounded-lg border px-2 py-1.5 text-sm font-medium bg-slate-900 text-white border-slate-900'
                  : 'rounded-lg border px-2 py-1.5 text-sm font-medium bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
              }
            >
              {h}
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
        <input
          type="checkbox"
          checked={prn}
          onChange={(e) => onChangePrn(e.target.checked)}
        />
        <span>Según necesidad (sin horario fijo)</span>
      </label>
    </div>
  )
}
