// Genera un .xlsx de prueba con el formato que usa la clienta.
// Uso: node scripts/generate-test-excel.mjs
import ExcelJS from 'exceljs'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const proyectoRoot = path.resolve(__dirname, '..')

const wb = new ExcelJS.Workbook()
wb.creator = 'Robotix — Test'
wb.created = new Date()

const ws = wb.addWorksheet('Familias')

ws.columns = [
  { header: 'Apellidos', key: 'apellidos', width: 18 },
  { header: 'nombre', key: 'nombre', width: 14 },
  { header: 'género', key: 'genero', width: 8 },
  { header: 'edad', key: 'edad', width: 6 },
  { header: 'chozo', key: 'chozo', width: 14 },
  { header: 'repetidor/a', key: 'repetidor', width: 10 },
  { header: 'correo', key: 'correo', width: 28 },
  { header: 'fecha nac', key: 'fechaNac', width: 12 },
  { header: 'centro educativo', key: 'centro', width: 24 },
  { header: 'padres', key: 'padres', width: 26 },
  { header: 'profesiones', key: 'profesiones', width: 22 },
  { header: 'dirección completa', key: 'direccion', width: 36 },
  { header: 'importe', key: 'importe', width: 10 },
  { header: 'programa', key: 'programa', width: 14 },
]

const filas = [
  // Familia única: Marc Huguet — 2 hijos, uno en cada programa
  {
    apellidos: 'Huguet López',
    nombre: 'Pere',
    genero: 'M',
    edad: 11,
    chozo: 'Caballeros',
    repetidor: 'No',
    correo: 'mhuguet@robotix.es',
    fechaNac: '15/03/2015',
    centro: 'Escola Robotix',
    padres: 'Marc Huguet y Ana López',
    profesiones: 'Ingeniero / Profesora',
    direccion: 'Calle Mayor 1, 08001 Barcelona',
    importe: 980,
    programa: 'Robótica',
  },
  {
    apellidos: 'Huguet López',
    nombre: 'Laia',
    genero: 'F',
    edad: 13,
    chozo: 'Damas',
    repetidor: 'No',
    correo: 'mhuguet@robotix.es',
    fechaNac: '22/06/2013',
    centro: 'Escola Robotix',
    padres: 'Marc Huguet y Ana López',
    profesiones: 'Ingeniero / Profesora',
    direccion: 'Calle Mayor 1, 08001 Barcelona',
    importe: 1050,
    programa: 'Emprendimiento',
  },
]

ws.addRows(filas)

// Estilo de cabecera
const header = ws.getRow(1)
header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
header.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0F172A' },
}
header.alignment = { vertical: 'middle' }
header.height = 22

const outDir = path.join(proyectoRoot, 'test-data')
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'familias-test.xlsx')
await wb.xlsx.writeFile(outPath)

console.log(`✓ Excel generado: ${outPath}`)
console.log(`  ${filas.length} filas (${new Set(filas.map((f) => f.correo)).size} emails únicos)`)
