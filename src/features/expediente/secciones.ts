export const SECCIONES = [
  { num: 1, titulo: 'Datos y contacto' },
  { num: 2, titulo: 'Salud y bienestar' },
  { num: 3, titulo: 'Autorizaciones médicas' },
  { num: 4, titulo: 'Cuéntanos sobre ti' },
  { num: 5, titulo: 'Conociéndote' },
  { num: 6, titulo: 'Decálogo de convivencia' },
  { num: 7, titulo: 'Datos, imagen y envío' },
] as const

export const TOTAL_SECCIONES = SECCIONES.length

export type SeccionNum = (typeof SECCIONES)[number]['num']
