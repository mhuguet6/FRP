# FRP — Aplicación de inscripciones del Campus FRP

Aplicación web interna de Robotix para gestionar las inscripciones al Campus FRP (Fundación Rafael del Pino). Sustituye un proceso manual basado en Signaturit (PDFs firmados + transcripción a mano a un Excel general) por un sistema integrado de extremo a extremo: invitación pre-cargada, formulario online, firmas manuscritas en canvas, almacenamiento estructurado, backoffice de gestión y generación automática de documentos por rol del equipo.

> Volumen objetivo: ~75 participantes / año en una única edición de 12 días. Año actual: **Campus FRP Julio 2026** con dos programas en paralelo (Robótica y Emprendimiento).

---

## Índice

1. [Stack técnico](#stack-técnico)
2. [Arquitectura](#arquitectura)
3. [Estructura del proyecto](#estructura-del-proyecto)
4. [Modelo de datos](#modelo-de-datos)
5. [Funcionalidades](#funcionalidades)
6. [Flujo completo de uso](#flujo-completo-de-uso)
7. [Desarrollo local](#desarrollo-local)
8. [Migraciones](#migraciones)
9. [Testing desde cero](#testing-desde-cero)
10. [Configuración de email para producción (Resend)](#configuración-de-email-para-producción-resend)
11. [Deploy a producción](#deploy-a-producción)
12. [Roadmap](#roadmap)
13. [Decisiones de producto](#decisiones-de-producto)

---

## Stack técnico

| Capa | Decisión | Notas |
|---|---|---|
| Frontend | **Vite 5 + React 18 + TypeScript** | SPA. React Router 7 para rutas. |
| Estilos | **Tailwind CSS v4** (plugin Vite) | Mobile-first. |
| Formularios | **React Hook Form + Zod 4** | Validación tipada + autosave con debounce. |
| BD + Auth + Storage | **Supabase** | Postgres con RLS, magic link + password auth, buckets privados. |
| Firma manuscrita | **signature_pad** | Canvas → PNG → Supabase Storage. |
| Excel | **exceljs** | Carga dinámica, no entra en bundle principal. |
| Word | **docx** | Carga dinámica. Embebe fotos vía `ImageRun`. |

---

## Arquitectura

Dos caras de la app en una sola SPA, diferenciadas por rol del usuario en tiempo de ejecución:

```
┌──────────────────────────────────────────────────────────────┐
│                          STAFF                                │
│                                                               │
│  / (Landing)                                                  │
│     ↓ login email + password                                  │
│  /admin              /admin/invitaciones        /admin/expediente/:id
│  ↓ lista filtrable  ↓ cargar Excel             ↓ ver detalle  │
│  ↓ Excel            ↓ enviar magic links       ↓ gestión interna
│  ↓ Cocinero (.docx) (pre-crea expedientes)     ↓ panel staff  │
│  ↓ Staff (.docx)                                ↓ cambio estado
│  ↓ Sanitario (.docx)                            ↓ observaciones
│                                                 ↓ confirmar imagen
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                          FAMILIA                              │
│                                                               │
│  Recibe email automatizado con magic link                    │
│     ↓ clic en enlace                                          │
│  /callback → reclamar invitaciones → /mis-expedientes        │
│                                       (o redirect directo si 1 hijo)
│     ↓                                                         │
│  /expediente/:id                                              │
│  Formulario en 7 secciones con autosave                      │
│     ↓                                                         │
│  Envío con firmas + bloqueo de edición                       │
└──────────────────────────────────────────────────────────────┘
```

### Autenticación

- **Familias**: magic link automatizado. El staff carga el Excel con la lista, se envía un correo con el enlace, la familia hace clic y entra. Cero fricción de "introduce tu email".
- **Staff**: email + contraseña. Más rápido para uso diario. El control de quién es staff vive en la tabla `staff_emails`.
- **Sesión persistente** en `localStorage`. Solo se cierra con "Cerrar sesión" explícita.

### Row Level Security

Toda la BD está protegida por RLS:
- Familia: solo ve y edita sus propios expedientes mientras el estado lo permita.
- Staff: lectura completa de todas las tablas + edición de estado/observaciones, vía la función `is_staff()` que comprueba `auth.jwt() ->> 'email'` contra `staff_emails`.
- Storage: buckets `firmas` y `documentos` privados; URLs firmadas con caducidad de 10 minutos.

---

## Estructura del proyecto

```
FRP/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig*.json
├── eslint.config.js
├── .env.example
├── .env.local                       # claves Supabase (gitignored)
│
├── scripts/
│   └── generate-test-excel.mjs      # genera Excel de prueba en test-data/
│
├── test-data/
│   └── familias-test.xlsx           # Excel de prueba para invitaciones
│
├── supabase/
│   ├── migrations/                  # 15 migraciones, ejecutar en orden
│   └── scripts/
│       └── cleanup_test_data.sql    # reset destructivo para testing
│
└── src/
    ├── main.tsx                     # router + RouterProvider
    ├── index.css                    # @import "tailwindcss"
    │
    ├── lib/
    │   ├── supabase.ts              # cliente único
    │   ├── useSession.ts            # hook de sesión
    │   ├── useStaffStatus.ts        # hook ¿soy staff?
    │   └── useAutosave.ts           # debounced save + flush on unmount
    │
    ├── components/
    │   ├── RequireAuth.tsx          # guard de rutas
    │   └── ui/
    │       ├── BarraProgreso.tsx
    │       ├── ErrorBanner.tsx
    │       ├── IndicadorGuardado.tsx
    │       └── PageSpinner.tsx
    │
    ├── routes/
    │   ├── public/
    │   │   ├── Landing.tsx              # login email+password (+ magic link fallback)
    │   │   ├── MensajeEnviado.tsx       # "revisa tu email"
    │   │   ├── Callback.tsx             # post magic link → redirige según rol
    │   │   └── MisExpedientes.tsx       # lista familia (redirige staff a /admin)
    │   └── backoffice/
    │       ├── BackofficeList.tsx       # lista, filtros, exports
    │       ├── BackofficeInvitaciones.tsx  # carga Excel + envío masivo
    │       └── BackofficeDetalle.tsx    # detalle + gestión + confirmación imagen
    │
    └── features/
        ├── expediente/
        │   ├── api.ts                       # tipos + funciones BD
        │   ├── secciones.ts                 # config de las 7 secciones
        │   ├── validacion.ts                # check de campos pendientes + helpers
        │   ├── firmaService.ts              # upload + textos firma
        │   ├── textosLegales.ts             # decálogo + reglamento
        │   ├── FormularioExpediente.tsx     # container con navegación
        │   ├── Seccion1Datos.tsx            # participante (foto obligatoria)
        │   ├── Seccion2Familia.tsx          # tutor (DNI regex) + 3 contactos (tel numérico)
        │   ├── Seccion3Salud.tsx            # 14 bloques + peso numérico
        │   ├── Seccion4Medicacion.tsx       # habitual + campus (limpia array al cambiar Sí→No)
        │   ├── Seccion5Conociendote.tsx     # 36 preguntas + 2 extras condicionales Emprendimiento
        │   ├── Seccion6Autorizaciones.tsx   # datos, imagen (2 opciones), normas
        │   ├── Seccion7Revision.tsx         # resumen + firmas + envío
        │   ├── ExpedienteEnviadoView.tsx    # confirmación post envío
        │   ├── FileUpload.tsx               # genérico → Storage
        │   ├── FotoUpload.tsx               # foto del niño
        │   └── SignatureCanvas.tsx          # canvas con ref imperativo
        │
        └── backoffice/
            ├── excelExport.ts          # .xlsx con fallback a jsonb
            ├── docxExport.ts           # 3 docs: cocinero / staff (con fotos) / sanitario
            └── invitacionesImport.ts   # parsing Excel + envío masivo de magic links
```

---

## Modelo de datos

### Tablas

```
auth.users                          ← Supabase nativo (email del usuario)

staff_emails                        ← quién puede entrar al backoffice
  email (pk), rol, created_at

campus_edicion                      ← configuración por temporada
  id, nombre, fecha_inicio, fecha_fin,
  fechas_llamada_familias date[],
  activa boolean (único parcial)

invitaciones                        ← bridge: Excel cargado → expedientes
  id, edicion_id, email,
  tutor_nombre,
  alumno_nombre, alumno_apellidos,
  fecha_nacimiento, direccion,
  programa ('robotica' | 'emprendimiento'),
  datos_clienta jsonb,              -- info interna (chozo, importe, etc.)
  enviada_at, reclamada_at,
  expediente_id (FK, ON DELETE SET NULL),
  error_envio
  UNIQUE(edicion_id, email, alumno_nombre, alumno_apellidos)

expedientes                         ← uno por niño/a inscrito
  id, user_id (auth), edicion_id,
  estado enum,
  programa ('robotica' | 'emprendimiento'),
  observaciones_internas (staff),
  imagen_confirmada_at, imagen_confirmada_por,
  -- columnas indexables (denormalizadas para listados y agregados):
  alumno_nombre, alumno_apellidos, fecha_nacimiento, curso,
  tutor_nombre, tutor_email, tutor_telefono, tutor_dni,
  foto_path,
  tiene_alergias, detalle_alergias, tiene_medicacion,
  -- resto en jsonb:
  respuestas jsonb,
  current_section int,
  created_at, updated_at, submitted_at, validated_at

datos_clienta                       ← info privada de la clienta (solo staff)
  expediente_id (pk), datos jsonb

medicaciones                        ← reservada (no usada hoy)
firmas                              ← 0..4 por expediente, una por tipo
documentos                          ← foto, vacunación, receta
eventos                             ← historial inmutable
recordatorios                       ← reservada
```

### Estados del expediente

```
creado
  ↓ familia abre formulario
en_progreso
  ↓ familia envía
enviado                             ← staff revisa
  ├→ validado
  ├→ requiere_correccion            ← familia vuelve a editar
  └→ cerrado
```

### Estrategia jsonb + columnas

`respuestas jsonb` guarda **todas** las respuestas del formulario (estructuradas por sección: `seccion1`, `seccion2`, …). Las columnas tipadas (`alumno_nombre`, `tiene_alergias`, etc.) son una denormalización de los campos críticos para queries rápidas. El autosave hace flush al desmontar el componente, evitando race conditions cuando la familia avanza muy rápido entre secciones.

### Buckets de Storage

| Bucket | Contenido | Path |
|---|---|---|
| `firmas` | PNGs de firma manuscrita | `<expediente_id>/<tipo>.png` |
| `documentos` | Foto del niño, vacunación, receta médica | `<expediente_id>/<tipo>/<uuid>.<ext>` |

---

## Funcionalidades

### Lado familia

- **Acceso directo desde el correo**. La familia no introduce su email; recibe un magic link automatizado a partir del Excel que carga la clienta.
- **Hermanos**: una familia con varios hijos recibe un solo correo. Al entrar ve uno o varios expedientes pre-creados.
- **Formulario de 7 secciones** con barra de progreso y autosave:
  1. **Datos del participante** — foto obligatoria, nombre, apellidos, fecha nacimiento (con edad calculada), dirección.
  2. **Familia y contactos** — tutor que firma, DNI (regex DNI/NIE), email de contacto editable, hasta 3 personas de contacto (teléfono solo numérico, relación select).
  3. **Salud** — 14 bloques médicos en una sola pantalla (alergias, antecedentes, mareos, alimentación con peso solo numérico, patologías, COVID, discapacidad/movilidad/motricidad, gafas, miedos, carácter, atención especial, vacunación con upload de certificado opcional).
  4. **Medicación** — habitual + durante Campus con receta adjunta. El array se limpia automáticamente si cambia de Sí a No (sin residuos).
  5. **Conociéndote** — 36 preguntas para participante y familia, dos condicionales extra si el programa es Emprendimiento (visualmente integradas, sin etiqueta especial para no exponer la lógica interna).
  6. **Autorizaciones y normas** — comunicaciones de la Fundación, derechos de imagen (con info pre-decisión y recordatorio suave si dice No), observaciones, agua/natación, llamada con familias, decálogo, reglamento.
  7. **Revisión y firmas** — resumen, lista de faltantes con enlaces, hasta 4 firmas en canvas + nombre del participante, envío final.
- **Autosave con debounce 1.5s + flush on unmount** + indicador visual.
- **Validación estricta**: radios sin selección por defecto, Sí exige detalle, checkboxes de reglamento obligatorios.
- **Estado "requiere_correccion"** desbloquea la edición para corregir y reenviar.

### Lado staff (backoffice)

- **Lista** filtrable por estado, programa, búsqueda libre y aviso "Pendiente confirmación imagen".
- **Detalle** del expediente con foto, datos por sección (incluida la sección Conociéndote colapsable), firmas con imagen, documentos adjuntos, historial.
- **Panel de gestión interna** (visible solo a staff):
  - Cambio de estado (`enviado`/`validado`/`requiere_correccion`/`cerrado`/`en_progreso`).
  - Observaciones internas, no visibles a la familia.
  - Botón **"Marcar imagen como confirmada"** cuando la familia dijo "No" y aún no se ha confirmado.
  - Cada acción registra un evento con el email del staff como actor.
- **Carga de invitaciones**: subir Excel de la clienta → preview con validación → envío masivo de magic links con un clic.
- **Exportación Excel** con 40+ columnas, fallback a `respuestas` jsonb, formato (cabecera oscura, freeze, auto-filter).
- **Documentos Word**:
  - **Cocinero**: tabla con niños que tienen alergia o dieta especial + anexo con el resto.
  - **Staff/monitores**: orientación apaisada, **foto embebida 56×56 px**, columna programa, datos clave.
  - **Sanitario**: bloques por niño con info médica completa, solo los relevantes.

### Carga dinámica

`exceljs` (~940 KB) y `docx` (~400 KB) se cargan **solo cuando el staff los necesita**. Las familias nunca descargan ese código.

---

## Flujo completo de uso

### 1) Preparación inicial (una vez por edición)

1. La clienta envía a Robotix la lista de familias inscritas en Excel (formato libre, con columnas como `apellidos, nombre, género, edad, chozo, repetidor/a, correo, fecha nac, centro educativo, padres, profesiones, dirección completa, importe, programa`).
2. Staff entra en `/admin/invitaciones`, sube el Excel.
3. El sistema parsea, normaliza nombres de columnas (acepta variaciones con acentos y mayúsculas), separa lo que va al formulario (nombre, apellidos, fecha nacimiento, dirección, email, programa) de lo que va a `datos_clienta` (chozo, importe, profesiones, etc.).
4. Staff revisa el preview, ajusta programa por defecto si el Excel no lo trae, y pulsa "Enviar invitaciones".
5. El sistema deduplica por email (familia con 2 hijos = 1 magic link) y manda el correo a cada uno.

### 2) Familia (típico)

1. Recibe correo "Tu acceso al formulario del Campus FRP" con un botón.
2. Clic → entra autenticada, ve uno o varios expedientes pre-creados con datos básicos (nombre, apellidos, fecha nacimiento, dirección, email).
3. Si tiene un solo hijo, va directa al formulario; si tiene varios, elige.
4. Completa las 7 secciones (~15-20 min). El autosave guarda automáticamente; puede cerrar y volver más tarde con el mismo enlace (durante la sesión).
5. En Sección 7 firma con el dedo/trackpad las firmas requeridas según haya marcado o no medicación, vacunación etc.
6. Envía. El expediente queda en estado `enviado` y bloqueado.

### 3) Staff revisa

1. En `/admin` ve la lista de expedientes enviados. Filtros y avisos visuales (incluido badge ámbar si la familia ha marcado "No" en imagen).
2. Abre el detalle. Lee, valida o pide corrección.
3. Si la familia marcó "No autorizo imagen": llama o escribe, explica las implicaciones, y pulsa "Marcar imagen como confirmada" en el panel.
4. Cuando todo está OK: cambia estado a `validado`.

### 4) Exportación

Una vez validados los expedientes:
- **Excel** general con una fila por expediente para gestión interna.
- **Cocinero (.docx)** para gestión de comidas.
- **Staff (.docx)** con fotos para monitores.
- **Sanitario (.docx)** para enfermería.

Todos respetan los filtros activos en el backoffice (estado, programa, etc.).

---

## Desarrollo local

### Requisitos

- Node ≥ 20.18 (probado en 20.18.1).
- Proyecto Supabase con migraciones 0001-0015 aplicadas.

### Setup

```bash
git clone <repo>
cd FRP
npm install
cp .env.example .env.local
# Edita .env.local con tu URL y anon key de Supabase
npm run dev
```

### Variables de entorno

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

### Comandos

```bash
npm run dev        # http://localhost:5173
npm run build      # type-check + producción
npm run preview    # sirve el build
npm run lint
```

---

## Migraciones

Aplicar en orden (Supabase Dashboard → SQL Editor → pegar y Run):

| # | Archivo | Qué hace |
|---|---|---|
| 0001 | `init.sql` | Esquema base: enum estado, tablas (expedientes, medicaciones, firmas, documentos, eventos, recordatorios), trigger updated_at, RLS para familia, buckets `firmas` y `documentos`. |
| 0002 | `eventos_insert.sql` | Política para que la familia inserte eventos en su expediente. |
| 0003 | `campus_edicion.sql` | Tabla `campus_edicion` con seed; columnas extra en expedientes (edicion_id, fecha_nacimiento, curso, tutor_dni, foto_path). |
| 0004 | `firmas_multi.sql` | Permite múltiples firmas por expediente con tipo distintivo. |
| 0005 | `fix_rls_envio.sql` | Separa USING y WITH CHECK para permitir transición a `enviado`. |
| 0006 | `staff_access.sql` | Tabla `staff_emails`, función `is_staff()`, políticas SELECT staff. |
| 0007 | `add_admin.sql` | Añade `marc.huguet.e@gmail.com` como admin. |
| 0008 | `backfill_columnas.sql` | Backfill de columnas NULL desde `respuestas`. |
| 0009 | `gestion_interna.sql` | Columna `observaciones_internas` + RLS UPDATE para staff. |
| 0010 | `invitaciones.sql` | Tabla `invitaciones`, `datos_clienta`, función `reclamar_invitaciones()`, columna `programa`. |
| 0011 | `fix_race_reclamar.sql` | `FOR UPDATE SKIP LOCKED` para evitar duplicados en llamadas concurrentes. |
| 0012 | `invitaciones_fk_set_null.sql` | ON DELETE SET NULL en FK invitaciones → expedientes (cleanups no fallan). |
| 0013 | `campus_2026.sql` | Actualiza Campus a Julio 2026. |
| 0014 | `confirmacion_imagen.sql` | Columnas `imagen_confirmada_at` y `imagen_confirmada_por`. |
| 0015 | `invitaciones_unique.sql` | Unique index en invitaciones para evitar duplicados si se sube el Excel dos veces. |

---

## Testing desde cero

Para resetear todo y probar el flujo end-to-end:

### 1. Limpiar BD

En SQL Editor, ejecuta:
```
supabase/scripts/cleanup_test_data.sql
```

Borra invitaciones, expedientes (cascada a firmas/documentos/eventos/datos_clienta) y usuarios de auth excepto `marc.huguet.e@gmail.com`. Los archivos de Storage quedan huérfanos (Supabase no permite borrarlos por SQL; opcional limpiar manualmente).

### 2. Establecer contraseña al admin

Si todavía no la tiene:
```sql
update auth.users
set encrypted_password = crypt('Robotix2026!', gen_salt('bf'))
where email = 'marc.huguet.e@gmail.com';
```

### 3. Regenerar Excel de prueba (opcional)

```bash
node scripts/generate-test-excel.mjs
```

Crea `test-data/familias-test.xlsx` con familias y programas. Por defecto: 1 familia (`mhuguet@robotix.es`) con 2 hijos en programas distintos (Pere en Robótica, Laia en Emprendimiento).

### 4. Probar como admin

1. `npm run dev` → http://localhost:5173 → login con admin.
2. `/admin/invitaciones` → sube `test-data/familias-test.xlsx` → envía invitaciones.

### 5. Probar como familia

1. Ventana incógnito → http://localhost:5173.
2. Click en el magic link recibido en `mhuguet@robotix.es` → entra autenticada.
3. Si tiene 2 hijos, ve `/mis-expedientes` con ambos. Si 1, va directa al formulario.
4. Completa el formulario, prueba la validación de DNI/teléfono/peso, las firmas y el envío.

### 6. De vuelta como admin

Refresca `/admin` → ve el expediente nuevo, abre el detalle, prueba cambiar estado, confirmar imagen si aplica, exportar Excel y .docx.

---

## Configuración de email para producción (Resend)

Supabase por defecto envía emails con un rate limit muy bajo (~4/hora), solo apto para testing. Para producción, conectar un proveedor SMTP externo.

**Resend** (recomendado): https://resend.com — free hasta 3000 emails/mes.

### Pasos

1. Crear cuenta en Resend.
2. Añadir dominio (`mail.robotix.es` o similar) y verificar DNS (3-4 registros TXT/MX).
3. En Resend → API Keys → crear key con permisos de envío.
4. En Supabase → Project Settings → Authentication → SMTP Settings:
   - Enable Custom SMTP: ON
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: la API key
   - Sender email: `noreply@mail.robotix.es`
   - Sender name: `Campus FRP`
5. Subir el rate limit en Project Settings → Authentication → Rate Limits.

---

## Deploy a producción

### Contexto

FRP vivirá como **subpath** del portal interno de Robotix (`herramientas.robotix.es/frp`), embebido en iframe. Cada app del portal tiene su propio proyecto Supabase y auth independiente.

### Cambios pendientes para subpath

1. **`vite.config.ts`**: `base: '/frp/'`.
2. **React Router**: `createBrowserRouter(routes, { basename: '/frp' })` en `main.tsx`.
3. **Magic link**: cambiar `emailRedirectTo` a la URL de producción.
4. **Supabase URL Configuration**: Site URL + Redirect URLs apuntando a `herramientas.robotix.es/frp/**`.
5. **Email template del magic link**: ya está en español, verificar tras deploy.

### Build

```bash
npm run build
# salida en dist/
```

Servir `dist/` desde la infraestructura de Robotix.

---

## Roadmap

### Completado

- ✅ Formulario familia 7 secciones (con autosave, validación, firmas, foto obligatoria, validación de DNI/teléfono/peso).
- ✅ Backoffice: lista filtrable, detalle, gestión interna (estado + observaciones), panel de confirmación imagen.
- ✅ Excel + 3 documentos Word (cocinero, staff con foto, sanitario).
- ✅ Carga masiva de familias desde Excel + envío automático de magic links.
- ✅ Login admin con email + password (no magic link).
- ✅ Soporte de dos programas (Robótica + Emprendimiento) con preguntas extra condicionales.
- ✅ Workflow de confirmación de derechos de imagen (3 capas: info pre-decisión + recordatorio suave si "No" + confirmación humana del staff).
- ✅ RLS + staff access funcionando.
- ✅ Decisión de eliminar opción "Autorizo parcialmente" — simplificado a Sí/No.

### Pendientes priorizados

| Prioridad | Tarea | Impacto |
|---|---|---|
| Alta | **Configurar Resend** en producción para no quedarse en 4 emails/hora. | Necesario para envío real a 74 familias. |
| Alta | **Recordatorios automáticos** por email a familias que abrieron pero no terminaron. | Reduce seguimiento manual. |
| Media | **Aviso por email al equipo** cuando llega un expediente nuevo (Edge Function + Resend). | Cierre del ciclo de feedback. |
| Media | **PDF por expediente** para imprimir/enviar (con firmas embebidas). | Casos de archivo y notificación. |
| Media | **Documentos por rol** adicionales: docente (actitud, miedos) y ocio (habilidades, motrices). | Más equipos sin filtrar a mano. |
| Media | **Roles diferenciados en backoffice** (cocina solo dietas, ocio solo habilidades). | Privacidad + reducción de ruido. |
| Media | **Estado visible para la familia** en `/mis-expedientes`. | Menos consultas tipo "¿lo habéis recibido?". |
| Baja | **UI de gestión de ediciones**: crear edición desde la app sin SQL. | Cuando lleguen ediciones distintas. |
| Baja | Auditoría server-side de firmas (IP / user agent). | Si surge requisito legal. |

### Decisiones descartadas explícitamente

- **Reutilización de datos entre ediciones**: cada año se piden de cero (decisión del equipo).
- **Firma electrónica certificada**: no es necesaria; firma manuscrita con dedo/trackpad es suficiente.
- **Versión papel del formulario**: todas las familias online desde 2017 sin incidencias.
- **SSO real entre apps del portal**: cada Supabase project es independiente; staff loguea en cada app con email + password.
- **Opción "Autorizo parcialmente"** en derechos de imagen: no aporta valor, simplificado a Sí/No.
- **Pop-up insistente al decir No en derechos de imagen**: rechazado por presión indebida; reemplazado por las 3 capas informativas.
- **Email "¿estás seguro?" tras envío**: rechazado; la confirmación humana del equipo (capa 3) es más efectiva.

---

## Decisiones de producto

Decisiones tomadas durante el diseño que conviene tener documentadas:

### Validación y UX

- **No/Sí sin selección por defecto** en preguntas críticas: obliga a la familia a marcar conscientemente.
- **Validación estricta al pulsar Siguiente**, no al escribir: el banner de error aparece tras intentar avanzar, no mientras tipea.
- **Sección 5 (Conociéndote) lenient en texto libre**: radios obligatorias pero las preguntas largas pueden quedar vacías. Es informativa, no crítica.
- **Hermanos con mismo email** comparten `user_id`: un tutor puede tener N expedientes.
- **El texto de autorización se guarda como snapshot inmutable**: aunque cambies el copy, las firmas existentes conservan lo que la familia leyó.
- **No persistencia entre ediciones**: cada año la familia rellena de cero, sin pre-fill.
- **Tutor firma de puño**, niño escribe su nombre en un input de texto (suficiente legalmente, niño es pequeño).

### Sistema de invitaciones

- **El admin nunca crea expedientes**: solo carga el Excel de la clienta y envía invitaciones. La familia entra y los expedientes se materializan automáticamente al hacer clic en el magic link.
- **Deduplicación por (edicion, email, nombre, apellidos)**: subir el Excel 2 veces no crea duplicados.
- **Race protection** vía `FOR UPDATE SKIP LOCKED`: si React StrictMode dispara la función dos veces, solo se procesan las invitaciones únicas.
- **Datos privados de la clienta** (importe, profesiones, chozo, etc.) en tabla separada `datos_clienta` con RLS staff-only: la familia no los ve aunque inspeccione.
- **"Padres" del Excel no precarga `tutor_nombre`**: suele tener dos nombres (ej. "Marc Huguet y Ana López") y el formulario pide UN tutor que firma. Se conserva el original en `datos_clienta`.

### Derechos de imagen (decisión estratégica)

Objetivo: maximizar consentimiento informado sin coacción.

- **Opción "Parcial" eliminada**: solo Sí o No. Simplifica decisión.
- **Tres capas**:
  1. **Antes de elegir**: caja azul informativa explicando las implicaciones (comunicación del Campus via Instagram y web).
  2. **Después de elegir "No"**: caja ámbar con recordatorio suave, una sola vez, sin pop-up modal.
  3. **Después del envío**: badge ámbar en el backoffice; el equipo contacta humanamente y registra confirmación.
- **No hay email automático de "¿estás seguro?"**: el contacto humano del equipo es más informativo.
- **Cumple RGPD**: consentimiento libre, informado, específico, inequívoco; sin dark patterns.

### Login y sesión

- **Familias**: magic link sin contraseña (cero fricción, mejor para uso una sola vez).
- **Staff**: email + contraseña (más rápido para uso diario). Cuenta creada con magic link inicial + password fijado por SQL o desde Auth admin.
- **Sesión persistente en localStorage**: el equipo no se desloguea cada cierre de pestaña. Se cierra con "Cerrar sesión" explícita o ventana de incógnito.
- **Admin no accede a `/mis-expedientes`**: redirección declarativa con `<Navigate>` sin parpadeo.

---

## Estado actual del proyecto

Aplicación funcional de extremo a extremo en local. Lista para:
- Validar el copy del formulario con el equipo.
- Coordinar con la clienta el formato exacto del Excel de inscritos.
- Configurar Resend en producción.
- Deploy a la infraestructura del portal de Robotix.

Las siguientes funcionalidades (PDF por expediente, aviso al equipo, recordatorios, docs adicionales) son extensiones del sistema actual y no requieren cambios estructurales.
