export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3"
    >
      {children}
    </div>
  )
}

export const MSG_FALTAN_RESPUESTAS =
  'Faltan respuestas o hay errores. Revisa los campos marcados en rojo más abajo.'
