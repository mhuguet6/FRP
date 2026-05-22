export const SECCIONES = [
  { num: 1, titulo: 'Datos del participante' },
  { num: 2, titulo: 'Familia y contactos' },
  { num: 3, titulo: 'Salud' },
  { num: 4, titulo: 'Medicación' },
  { num: 5, titulo: 'Conociéndote' },
  { num: 6, titulo: 'Autorizaciones y normas' },
  { num: 7, titulo: 'Revisión y firmas' },
] as const

export const TOTAL_SECCIONES = SECCIONES.length

export type SeccionNum = (typeof SECCIONES)[number]['num']
