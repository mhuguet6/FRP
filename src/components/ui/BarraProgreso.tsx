import { SECCIONES, TOTAL_SECCIONES } from '../../features/expediente/secciones'

export function BarraProgreso({ seccion }: { seccion: number }) {
  const pct = (seccion / TOTAL_SECCIONES) * 100
  const titulo =
    SECCIONES.find((s) => s.num === seccion)?.titulo ?? ''

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Sección {seccion} de {TOTAL_SECCIONES}
        </span>
        <span className="truncate ml-2">{titulo}</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-slate-900 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
