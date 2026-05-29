import { z } from 'zod'

// ============================================================================
// Mensajes de error globales para Zod
//
// Por defecto Zod 4 muestra mensajes en inglés (o claves tipo
// "error.expectedValue.NO") cuando una validación falla sin un `message:`
// custom. Esto se filtraba a las familias en algunos campos.
//
// Aquí definimos un fallback en español para todos los códigos de error
// frecuentes. Si un schema concreto ya tiene `message: 'X'`, ese tiene
// preferencia — esto solo cubre los casos sin mensaje.
// ============================================================================

const FALTA_RELLENAR = 'Por favor, rellena este campo para continuar'

z.config({
  // El callback `customError` recibe el issue de Zod y debe devolver un
  // string (o undefined para usar el default de Zod).
  customError: (iss) => {
    const code = (iss as { code?: string }).code

    switch (code) {
      // Tipo incorrecto (undefined cuando se espera string, etc.)
      case 'invalid_type':
        return FALTA_RELLENAR
      // Valor inválido (literal incorrecto, no es uno de los valores
      // permitidos del enum).
      case 'invalid_value':
        return 'Selecciona una opción válida'
      // String demasiado corto, array vacío cuando min > 0, etc.
      case 'too_small':
        return FALTA_RELLENAR
      // String demasiado largo, etc.
      case 'too_big':
        return 'Este texto es demasiado largo'
      // Unión: ninguno de los tipos casa.
      case 'invalid_union':
        return 'Selecciona una opción'
      // Formato inválido (email, regex, etc.)
      case 'invalid_format':
        return 'El formato no es válido'
      default:
        return undefined
    }
  },
})
