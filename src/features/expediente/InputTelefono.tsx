import { Controller, type Control } from 'react-hook-form'

// Lista de prefijos disponibles en el selector
export const PREFIJOS: Array<{ code: string; label: string }> = [
  { code: '+34', label: 'España' },
  { code: '+33', label: 'Francia' },
  { code: '+351', label: 'Portugal' },
  { code: '+39', label: 'Italia' },
  { code: '+49', label: 'Alemania' },
  { code: '+44', label: 'Reino Unido' },
  { code: '+41', label: 'Suiza' },
  { code: '+32', label: 'Bélgica' },
  { code: '+31', label: 'Países Bajos' },
  { code: '+212', label: 'Marruecos' },
  { code: '+1', label: 'EE.UU. / Canadá' },
  { code: '+52', label: 'México' },
  { code: '+54', label: 'Argentina' },
  { code: '+57', label: 'Colombia' },
  { code: '+55', label: 'Brasil' },
]

// Regex para validación: nuevo formato +CC<dígitos> o legacy puros dígitos
export const TELEFONO_REGEX = /^(\+\d{8,18}|\d{9,15})$/

export function parseTelefono(valor: string): { prefijo: string; digitos: string } {
  if (typeof valor !== 'string' || !valor) {
    return { prefijo: '+34', digitos: '' }
  }
  if (valor.startsWith('+')) {
    const ordenados = [...PREFIJOS].sort(
      (a, b) => b.code.length - a.code.length
    )
    for (const p of ordenados) {
      if (valor.startsWith(p.code)) {
        return { prefijo: p.code, digitos: valor.slice(p.code.length) }
      }
    }
    return { prefijo: '+34', digitos: valor.replace(/^\+\d+/, '') }
  }
  return { prefijo: '+34', digitos: valor }
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

export function InputTelefono({
  name,
  control,
}: {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const valor = (field.value ?? '') as string
        const { prefijo, digitos } = parseTelefono(valor)
        return (
          <div className="flex gap-2">
            <select
              value={prefijo}
              onChange={(e) => field.onChange(e.target.value + digitos)}
              onBlur={field.onBlur}
              className="rounded-lg border border-slate-300 px-2 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white shrink-0"
              aria-label="Prefijo país"
            >
              {PREFIJOS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} {p.label}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={15}
              pattern="[0-9]*"
              placeholder="600111222"
              value={digitos}
              onChange={(e) =>
                field.onChange(prefijo + e.target.value.replace(/\D/g, ''))
              }
              onBlur={field.onBlur}
              ref={field.ref}
              className={`${inputCls} flex-1`}
            />
          </div>
        )
      }}
    />
  )
}
