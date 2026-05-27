# FRP — App de inscripciones del Campus FRP

Aplicación web interna de **Robotix** para gestionar las inscripciones al **Campus FRP** (Fundación Rafael del Pino). Sustituye el proceso histórico basado en Signaturit + transcripción manual a Excel por un flujo integrado:

- la clienta carga los niños inscritos,
- el admin confirma pagos y envía el formulario,
- la familia rellena, firma con el dedo y envía (puede modificar después),
- el equipo genera PDFs por rol (cocinero, médico) y un log de actividad,
- el admin gestiona también recordatorios, alta de staff del Campus y edición completa de cualquier dato.

> **Volumen objetivo**: ~75 participantes/año en una única edición de 12 días. Año actual: **Campus FRP Julio 2026** con dos programas en paralelo (Robótica y Emprendimiento).

---

## Índice

1. [Glosario y roles](#1-glosario-y-roles)
2. [Flujo end-to-end](#2-flujo-end-to-end)
3. [Funcionalidades por rol](#3-funcionalidades-por-rol)
4. [Modelo de datos](#4-modelo-de-datos)
5. [Stack técnico](#5-stack-técnico)
6. [Arquitectura y rutas](#6-arquitectura-y-rutas)
7. [Estructura del proyecto](#7-estructura-del-proyecto)
8. [Desarrollo local](#8-desarrollo-local)
9. [Migraciones](#9-migraciones)
10. [Provisión de usuarios](#10-provisión-de-usuarios)
11. [Configuración de email para producción (Resend)](#11-configuración-de-email-para-producción-resend)
12. [Testing desde cero](#12-testing-desde-cero)
13. [Deploy a producción](#13-deploy-a-producción)
14. [Decisiones de producto](#14-decisiones-de-producto)
15. [Roadmap](#15-roadmap)

---

## 1. Glosario y roles

### Glosario rápido

| Término | Significado |
|---|---|
| **Edición** | Una temporada del Campus (p. ej. "Campus FRP Julio 2026"). Una sola activa en cada momento. |
| **Expediente** | Una fila por persona del Campus (niño/a o miembro del staff). Es la entidad central. |
| **Programa** | "Robótica" o "Emprendimiento". Cada niño/a y cada staff pertenece a uno (o a ninguno en el caso del staff). |
| **Magic link** | Email de Supabase con un enlace que autentica a la familia sin contraseña. |
| **Tipo de expediente** | `estudiante` (niño/a) o `staff` (miembro del equipo del Campus). |

### Roles del sistema

La aplicación tiene **cuatro roles**, tres humanos con login y uno que es solo un tipo de expediente.

| Rol | Quién es | Cómo entra | Qué hace |
|---|---|---|---|
| **Clienta** | Persona externa de la Fundación que coordina las inscripciones | Email + password en `/` (p. ej. `mhuguet@robotix.es`) → redirige a `/clienta` | Carga la lista de niños inscritos al Campus (uno a uno con un formulario, o subiendo un Excel). Solo aporta info básica. No ve estados de pago ni de envío. |
| **Admin / staff de Robotix** | Equipo interno de Robotix | Email + password en `/` (p. ej. `marc.huguet.e@gmail.com`) → redirige a `/admin` | Confirma pagos, envía el formulario a las familias, revisa expedientes, gestiona staff del Campus, genera documentos PDF, manda recordatorios, edita cualquier dato. |
| **Familia** | Tutor del niño/a inscrito | Magic link al email del tutor → redirige a `/mis-expedientes` | Rellena las 7 secciones del formulario, firma en canvas, envía. **Puede modificar libremente tras enviar**: la app detecta los cambios, exige re-firma si toca y avisa al admin. |
| **Staff del Campus** *(tipo de expediente, no login)* | Monitores, cocineros, sanitarios contratados | No tiene login. El admin los crea a mano | Información mínima en la base (datos personales + alergias + comida + medicación) para que aparezcan en los documentos PDF junto a los niños cuando proceda. |

> **Aviso terminológico**: "staff" en este proyecto se refiere a dos cosas distintas. Por un lado, **el rol del equipo de Robotix** (sinónimo de admin) — tienen acceso a `/admin`. Por otro lado, un **tipo de expediente** que diferencia a los miembros del equipo del Campus de los niños inscritos. Cuando el README diga "el admin", se refiere al rol; "los staff" o "tipo=staff" se refiere al tipo de expediente.

---

## 2. Flujo end-to-end

El sistema cubre 8 fases. Las primeras 5 son el camino feliz del Campus 2026; las 6-8 son herramientas paralelas.

### Fase 1 — La Clienta carga los niños

1. La clienta entra en `/` con su email/password → redirige a `/clienta`.
2. Carga los niños de una de estas dos maneras:
   - **Uno a uno**: pulsa "Añadir un niño/a" → rellena un formulario con apellidos, nombre, fecha nac (mín. 5 años), dirección, correo del tutor, programa, género, edad, chozo, repetidor/a, centro educativo, padres, profesiones, importe, **observaciones**.
   - **Excel**: pulsa "Subir Excel" → sube la hoja, revisa el preview, confirma. El parser:
     - Reconoce columnas conocidas (acentos, mayúsculas y variantes habituales).
     - **Ignora las columnas que no reconoce** (lo dice en pantalla).
     - Si el Excel trae imágenes, gráficos o logos, sale un mensaje claro pidiendo copiar los datos en una hoja en blanco con "Pegado especial → Valores".
3. Por cada niño guardado:
   - Se crea una fila en `expedientes` con `tipo='estudiante'`, `estado='creado'`, info básica en columnas + jsonb.
   - Un trigger asigna automáticamente un **código** tipo `FRP-2026-001`, `FRP-2026-002`, ...
   - Se inserta una `invitaciones` con `expediente_id` ya rellenado y `enviada_at = null`. **Nada se manda todavía a la familia.**
   - Si la clienta aportó datos extra (chozo, importe, observaciones, etc.), se guardan en `datos_clienta`, una tabla aparte con RLS staff/clienta-only (la familia nunca los ve).

### Fase 2 — El Admin confirma pagos y envía el formulario

1. El admin entra en `/` → redirige a `/admin`.
2. Ve la lista de expedientes con sus códigos `FRP-…`, estados, programas y emails. Filtros disponibles: **tipo** (Estudiantes / Staff), **estado**, **programa** (Robótica / Emprendimiento), aviso "Pendiente confirmación imagen", búsqueda libre.
3. Selecciona con **checkboxes multi-fila** los niños cuyo pago ha confirmado (mediante transferencia, factura, etc., fuera del sistema).
4. Pulsa **✓ Marcar pagado (N)** → cada fila seleccionada queda con `pagado_at = now()` y un badge verde "✓ Pagado dd/mm".
5. Pulsa **↗ Enviar formulario (N)** → manda magic link a las familias pagadas-no-enviadas (agrupando por email — hermanos con mismo email reciben un solo correo). Cada expediente queda con `formulario_enviado_at` y badge azul "Form enviado dd/mm".

#### Variante para 2025 (transición)

Si en algún momento toca enviar el formulario **antes** de que las familias hayan pagado (caso del año actual donde ya hay expedientes y pagos van llegando con retraso):

- Selecciona los expedientes a los que quieras enviar.
- Pulsa **↗ Enviar sin pago (N)** (botón gris, secundario). Manda el magic link sin tocar `pagado_at`. El evento se registra con payload `{bypass_pago: true}` para auditoría.
- Cuando lleguen los pagos reales, vas seleccionando y marcando "✓ Marcar pagado" como en el flujo normal.

#### Anulación de pago

Si el admin marca pagado por error, entra en `/admin/expediente/:id` y, dentro del panel "Gestión interna" arriba del todo, ve un bloque rojo:

> **Pago confirmado** — Este expediente está marcado como pagado el dd/mm/aaaa hh:mm por *email_admin*. Si fue un error, puedes anularlo. [✗ Anular confirmación de pago]

Pulsar el botón limpia `pagado_at` y `pagado_por`, registra un evento `pago_revertido` para auditoría y el badge verde desaparece. Si el formulario ya se había enviado, el aviso pide confirmación explícita.

### Fase 3 — La Familia rellena el formulario

1. La familia recibe el correo "Tu acceso al formulario del Campus FRP".
2. Pulsa el enlace → llega a `/callback` → la función `reclamar_invitaciones()` enlaza su `user_id` al expediente que la clienta ya creó (sin duplicar).
3. Si tiene un solo hijo, va directa al formulario. Con varios, ve la lista en `/mis-expedientes`.
4. Rellena las **7 secciones** con autosave cada 1.5s + flush al desmontar:
   1. **Datos del participante** — foto obligatoria, nombre, apellidos, fecha nac (edad calculada), dirección. Pre-rellenadas por la clienta; la familia puede corregir.
   2. **Familia y contactos** — tutor que firma, DNI/NIE con regex, email editable, hasta 3 personas de contacto con **selector de prefijo internacional** (España default + 14 países).
   3. **Salud** — 14 bloques (alergias, antecedentes, mareos, alimentación con peso numérico, patologías, COVID, discapacidad, movilidad, motricidad, gafas, miedos, carácter, atención especial, vacunación con upload de certificado opcional).
   4. **Medicación** — habitual + durante Campus. Cada medicamento tiene nombre, dosis, **selector de horas** (chips toggleables 07:00–22:00) y opción "según necesidad" (PRN). Receta médica adjunta obligatoria si toma medicación en el Campus.
   5. **Conociéndote** — 36 preguntas para el participante y la familia, dos extras condicionales si el programa es Emprendimiento.
   6. **Autorizaciones y normas** — comunicaciones de la Fundación, derechos de imagen (Sí/No con info pre-decisión y recordatorio suave si dice No), observaciones, agua/natación, llamada con familias, decálogo, reglamento.
   7. **Revisión y firmas** — resumen, lista de faltantes con enlaces, hasta 4 firmas manuscritas + nombre del participante, envío final.
5. Al enviar, `estado='enviado'` y `submitted_at = now()`.

### Fase 3b — Modificación posterior al envío (familia)

La familia puede volver al formulario en cualquier momento mientras el expediente no esté `cerrado` y modificar cualquier dato.

1. Entra de nuevo (sesión persistente en su navegador o re-pidiendo magic link desde `/`).
2. Si el formulario ya estaba enviado, Sección 7 muestra `ExpedienteEnviadoView` con un **botón ámbar "✎ Modificar formulario"**.
3. Al pulsarlo va a Sección 1. Cualquier edición dispara el autosave normal, que también setea `modificado_postenvio_at`. La primera edición de cada "ola" registra un evento `expediente_modificado_postenvio`.
4. Un banner ámbar en el form recuerda: "Estás modificando un formulario que ya enviaste. Los cambios se guardan automáticamente. Si afecta a una firma, tendrás que volver a firmarla en la Sección 7."
5. Sección 7 entra en **modo confirmación**: título "Revisión y confirmación", debe volver a firmar las firmas necesarias y pulsar el botón ámbar **"Confirmar cambios"**. Esto sube las firmas nuevas, limpia `modificado_postenvio_at` y registra evento `modificacion_confirmada`.
6. Mientras `modificado_postenvio_at != null`, el admin ve en `/admin` un badge ámbar **"✎ Modificado dd/mm"** junto al nombre. Tras confirmar, el badge desaparece.

> **Estado del expediente** no cambia durante la modificación: sigue en `enviado`, `validado` o lo que estuviera. Solo `cerrado` bloquea la edición.

### Fase 4 — Recordatorios (opcional, admin)

Si pasan días y algunas familias no han completado:

1. El admin entra en `/admin/recordatorios`.
2. Ve la lista de pendientes (`tipo='estudiante'` + `formulario_enviado_at != null` + `submitted_at IS NULL`).
3. Por cada una: nombre, email, programa, días desde envío, progreso "Sección N de 7", "Último recordatorio: hace X d (N veces)".
4. Selecciona con checkboxes y pulsa **↗ Enviar recordatorio**. Reenvía el magic link y registra evento `recordatorio_enviado`.

### Fase 5 — Revisión y edición por el admin

En `/admin/expediente/:id`:

1. Vista completa: foto, datos por sección, firmas, documentos adjuntos, historial de eventos.
2. **Panel de gestión interna**:
   - Anular confirmación de pago (si aplica, arriba del todo en rojo).
   - Cambio de estado (`enviado` / `validado` / `requiere_correccion` / `cerrado` / `en_progreso`).
   - Observaciones internas (no visibles a la familia).
   - "Marcar imagen como confirmada" cuando aplica.
3. **Bloque "Datos de la clienta"** si la clienta aportó info extra: caja ámbar destacada con observaciones + el resto (chozo, importe, padres, profesiones, género, edad, repetidor, centro educativo). Marcado "Privado, no visible a la familia".
4. **Panel de edición**:
   - **✎ Datos básicos** inline (nombre, apellidos, fecha nac, programa, dirección, tutor con email/teléfono/DNI).
   - **✎ Formulario completo →** abre `/admin/expediente/:id/editar`, que es el mismo formulario que rellena la familia pero **sin bloqueo por estado**, con badge ámbar "Modo edición admin". El admin puede cambiar absolutamente cualquier campo (foto, firmas, autorizaciones...).

### Fase 6 — Generación de documentos PDF

Una vez con expedientes validados, el admin filtra (estado / programa / **tipo: estudiantes o staff del Campus**) y descarga PDFs desde los botones del header de `/admin`:

- **Cocinero (PDF)**: alergias y dietas, con tabla principal de los participantes con necesidades especiales + listado del resto al final.
- **Médico (PDF)**: dos secciones — tabla individual con medicación pautada + tabla por horario (cada hora agrupa qué niño toma qué).

Cada documento se genera con jsPDF + autoTable (dinámicamente importado para no engordar el bundle de las familias). El nombre del archivo incluye el contexto exacto del filtro:

```
frp-2026-cocinero-estudiantes-robotica-2026-05-27.pdf
frp-2026-medico-staffs-emprendimiento-2026-05-27.pdf
frp-2026-cocinero-todos-tipos-todos-programas-2026-05-27.pdf
```

Cada generación registra un evento `pdf_generado` con `expediente_id = NULL` y payload con doc + filtros + número de expedientes incluidos, para el log de auditoría.

> Los documentos "Sanitario (PDF)" y "Excel general" existían en versiones anteriores pero se retiraron del UI por decisión de producto. La función `exportarPdfSanitario` sigue en `pdfExport.ts` por si vuelve a hacer falta — reañadir es 30 segundos (1 botón + 1 handler).

### Fase 7 — Log de actividad

Desde `/admin`, el botón **↓ Log (PDF)** descarga un PDF cronológico acumulativo desde el día 1 con dos secciones:

1. **Formularios enviados a familias**: fecha, nº `FRP-…`, niño, email, programa, enviado por.
2. **Documentos PDF generados**: fecha, doc (cocinero/médico), filtros aplicados, cantidad de expedientes, generado por.

No se archivan logs; cada descarga es una foto del histórico completo a esa hora.

### Fase 8 — Alta de staff del Campus

Paralelamente al flujo de niños, el admin puede dar de alta miembros del equipo (cocineros, monitores, sanitarios, etc.) desde `/admin/staff/nuevo`:

- Form en 4 bloques: básicos (nombre, apellidos, fecha nac con mínimo 16 años, DNI/NIE con regex y auto-uppercase, email, teléfono, programa opcional) + alergias + comida (dieta especial + come) + medicación con selector de horas.
- Al guardar, un trigger asigna `STF-2026-001`, `STF-2026-002`... **contador independiente** del de niños.
- Queda en `expedientes` con `tipo='staff'`. Filtrando por Staff en `/admin` se ven; filtrando por Estudiantes no aparecen.
- Cuando se generan PDFs filtrando por Staff + Programa, los documentos solo incluyen al equipo.
- Al staff **no se le envía formulario** ni se le pide pago. Toda su info la mete el admin.
- **La clienta nunca ve los staff** — su dashboard filtra por `tipo='estudiante'`.

---

## 3. Funcionalidades por rol

### 3.1 Clienta (`/clienta`)

- **Dashboard** con título neutro y tabla de **solo estudiantes** (Nº, alumno, programa, email tutor, botón borrar antes de envío). No hay columna de estado: la clienta no necesita saber qué pasa después.
- **Form alta niño** con 14 campos, asterisco en obligatorios, fecha nacimiento mínimo 5 años, repetidor como Sí/No, dirección obligatoria. Incluye textarea **"Observaciones (opcional)"** para notas que solo verá el admin.
- **Importar Excel**:
  - Preview con cuenta de filas listas / sin programa / con error.
  - Selección de programa por defecto si el Excel no lo trae.
  - **Columnas no reconocidas se ignoran** (aviso en pantalla).
  - Botón "Crear N expedientes" cuando todo OK.
  - Mensajes de error claros si el archivo tiene imágenes/decoración.

### 3.2 Familia (`/mis-expedientes`, `/expediente/:id`)

- **Sesión persistente** en localStorage. Mientras no borre cookies ni cambie de navegador, no necesita re-clicar magic link aunque cierre tab/navegador.
- Si pierde el acceso, va a `/` → "Familia que perdió el enlace" → pide uno nuevo.
- **Formulario de 7 secciones** con autosave 1.5s + flush al desmontar + indicador visual.
- **Selector de prefijo telefónico internacional** (España default, 14 países más).
- **Selector de horas** para medicación (07:00–22:00) + opción "según necesidad" (PRN).
- Validación estricta al pulsar Siguiente. Banner de error si faltan respuestas.
- Estado `requiere_correccion` desbloquea edición para corregir y reenviar (workflow del admin).
- **Modificación tras envío** (Fase 3b): botón "✎ Modificar formulario" en `ExpedienteEnviadoView`. Cualquier cambio bumpea `modificado_postenvio_at` y exige re-firma en Sección 7.

### 3.3 Admin — Lista (`/admin`)

#### Header
- Links: **+ Invitar familias** (legacy), **+ Añadir staff**, **✉ Recordatorios**.
- Botón logout.

#### Filtros
- **Tipo**: Estudiantes (default) / Staff. Multi-select.
- **Estado**: Sin empezar / En progreso / Enviado. Multi-select.
- **Programa**: Robótica / Emprendimiento. Multi-select.
- **Aviso "Pendiente confirmación imagen"** (toggle).
- **Búsqueda libre** por nombre/tutor/email.
- **Limpiar filtros**.

#### Botones de acción (cabecera del listado)
Tres botones de acción + 2 de exports:

1. **✓ Marcar pagado (N)** — verde. Aplica `pagado_at = now()` a las filas seleccionadas que aún no estén pagadas.
2. **↗ Enviar formulario (N)** — azul (**flujo estricto**). Cuenta automáticamente las pagadas-no-enviadas (sin necesidad de selección) y manda magic link.
3. **↗ Enviar sin pago (N)** — gris (**flujo transitorio 2025**). Manda magic link a las **seleccionadas** que aún no estén enviadas, sin importar pago. NO toca `pagado_at`. Evento con `bypass_pago: true`.
4. **↓ Cocinero (PDF)** — exporta alergias/dietas.
5. **↓ Médico (PDF)** — exporta hoja de administración de medicación.
6. **↓ Log (PDF)** — histórico de envíos + generaciones.

#### Columna "Pagado" (cambió en la última iteración)

Es una columna multi-función:

- **Checkbox de selección** (multi-select tipo Gmail).
- Debajo, **badges de estado no interactivos**:
  - `✓ Pagado dd/mm` (verde) si pagado.
  - `Form enviado dd/mm` (azul) si enviado.
  - `⚠ Sin email de tutor` (rojo) si pagado pero falta email.
- Los staff muestran solo `—` (no aplican estos estados).

#### Badges junto al nombre del alumno

- `⚠ Imagen` — familia dijo "No" en derechos de imagen y aún no se confirmó humanamente.
- `✎ Modificado dd/mm` — familia modificó el formulario tras enviarlo y aún no ha confirmado los cambios. Desaparece tras re-firmar.

### 3.4 Admin — Detalle del expediente (`/admin/expediente/:id`)

Estructura de la página:

1. **Cabecera** con nombre, foto, código `FRP-…/STF-…`, programa, estado.
2. **Panel "Gestión interna"** (caja ámbar, solo staff):
   - Bloque rojo arriba del todo si el expediente está pagado: **✗ Anular confirmación de pago** (con aviso si el formulario ya se envió).
   - Cambio de estado.
   - Observaciones internas.
   - "Marcar imagen como confirmada" cuando aplique.
3. **Panel "Editar expediente"**:
   - **✎ Datos básicos** → form inline con nombre/apellidos/fecha nac/programa/dirección/tutor.
   - **✎ Formulario completo →** abre `/admin/expediente/:id/editar`.
4. **Bloque "Datos de la clienta"** (si hay info extra): caja ámbar destacada para observaciones + grid con chozo, importe, padres, profesiones, género, edad, repetidor, centro educativo. Etiqueta "Privado, no visible a la familia".
5. **Secciones del formulario** (1-6 colapsables y/o lista) y **Sección 7** con firmas + documentos.
6. **Historial de eventos** al pie.

### 3.5 Admin — Edición completa (`/admin/expediente/:id/editar`)

- Misma UI que el formulario de la familia.
- **Sin bloqueo por estado**: aunque esté `enviado`/`validado`, el admin puede entrar.
- **Badge ámbar "Modo edición admin"** en la cabecera.
- Enlaces de navegación adaptados para volver al detalle del admin.
- Las modificaciones aquí **no disparan** `modificado_postenvio_at` ni el evento de familia (esa lógica es solo para edits de familia).

### 3.6 Admin — Recordatorios (`/admin/recordatorios`)

- Lista de pendientes con multi-select.
- Filtro por programa.
- Columnas: nº, niño, email tutor, programa, días desde envío, progreso, último recordatorio.
- Botón "↗ Enviar recordatorio a N familias".
- Aviso ámbar sobre rate limit de Supabase Auth si no hay Resend.

### 3.7 Admin — Alta de staff (`/admin/staff/nuevo`)

- Form 4 bloques: básicos + alergias + comida + medicación.
- Numeración automática `STF-2026-NNN`.
- Aparece en `/admin` filtrando por Staff. Invisible para la clienta.

---

## 4. Modelo de datos

### Tablas principales

```
auth.users                          Supabase nativo

staff_emails                        Rol admin
  email (pk), rol, created_at

clienta_emails                      Rol clienta
  email (pk), nombre, created_at

campus_edicion                      Configuración de la edición
  id, nombre, fecha_inicio, fecha_fin,
  fechas_llamada_familias date[],
  activa boolean (único parcial)

invitaciones                        Bridge clienta → expedientes → familia
  id, edicion_id, email,
  tutor_nombre, alumno_nombre, alumno_apellidos,
  fecha_nacimiento, direccion, programa,
  datos_clienta jsonb,
  enviada_at, reclamada_at,
  expediente_id (FK ON DELETE SET NULL),
  error_envio
  UNIQUE(edicion_id, email, alumno_nombre, alumno_apellidos)

expedientes                         Una fila por niño O por miembro del staff
  id, user_id (nullable; rellenado al reclamar la invitación),
  numero_participante,              FRP-YYYY-NNN (estudiantes) o STF-YYYY-NNN (staff)
  edicion_id,
  estado enum,
  tipo,                             'estudiante' | 'staff'
  programa,                         'robotica' | 'emprendimiento' | null
  observaciones_internas (staff),
  imagen_confirmada_at, imagen_confirmada_por,
  pagado_at, pagado_por,
  formulario_enviado_at, formulario_enviado_por,
  modificado_postenvio_at,          timestamp del último edit familiar tras enviar
  alumno_nombre, alumno_apellidos, fecha_nacimiento, curso,
  tutor_nombre, tutor_email, tutor_telefono, tutor_dni,
  foto_path,
  tiene_alergias, detalle_alergias, tiene_medicacion,
  respuestas jsonb,                 todas las respuestas estructuradas por sección
  current_section int,
  created_at, updated_at, submitted_at, validated_at

datos_clienta                       Info privada de la clienta (RLS staff/clienta-only)
  expediente_id (pk), datos jsonb

firmas                              0..4 por expediente, una por tipo
  expediente_id, tipo, storage_path, firmado_por, texto_autorizacion, firmado_at

documentos                          Foto, vacunación, receta
  expediente_id, tipo, storage_path, nombre_original, size_bytes, created_at

eventos                             Historial inmutable (expediente_id nullable para eventos globales)
  id (bigserial), expediente_id, tipo, payload jsonb, actor, created_at

recordatorios                       Reservada (no usada hoy)
medicaciones                        Reservada (no usada hoy)
```

### Estados del expediente

```
creado                              Recién creado (clienta o admin)
  ↓ familia abre formulario
en_progreso                         Editando
  ↓ familia envía
enviado                             Staff revisa
  ├→ validado                       Admin valida
  ├→ requiere_correccion           Familia vuelve a editar
  └→ cerrado                        Terminal — única que bloquea edición familiar
```

### Tipos de evento registrados en `eventos`

| `tipo` | Cuándo | Actor |
|---|---|---|
| `expediente_creado` | Familia crea expediente manualmente desde `/mis-expedientes` | familia |
| `navegacion_seccion` | Familia navega entre secciones | familia |
| `formulario_enviado` | Familia pulsa Enviar en Sección 7 (también con `bypass_pago: true` cuando admin envía sin pago) | familia / admin email |
| `expediente_modificado_postenvio` | Familia hace su primera edición tras haber enviado | familia |
| `modificacion_confirmada` | Familia re-firma y confirma cambios postenvío | familia |
| `estado_cambiado` | Admin cambia el estado | email admin |
| `observaciones_internas_modificadas` | Admin edita observaciones | email admin |
| `imagen_confirmada` | Admin marca imagen como confirmada | email admin |
| `datos_editados` | Admin edita datos básicos vía panel inline | email admin |
| `pago_revertido` | Admin anula la confirmación de pago | email admin |
| `pdf_generado` | Admin descarga un PDF de gestión (expediente_id NULL) | email admin |
| `recordatorio_enviado` | Admin reenvía magic link | email admin |

> Eventos con `expediente_id IS NULL` son acciones globales (típicamente `pdf_generado`).

### Numeración automática (`numero_participante`)

Un trigger `BEFORE INSERT` en `expedientes` asigna automáticamente:

- `FRP-YYYY-NNN` para `tipo='estudiante'`
- `STF-YYYY-NNN` para `tipo='staff'`

Contadores **independientes** por tipo dentro de la misma edición. Año extraído de `campus_edicion.fecha_inicio`. Unique index `(edicion_id, numero_participante)` como salvaguarda contra carreras.

### Estrategia jsonb + columnas

- `respuestas jsonb` guarda **todas** las respuestas del formulario (estructuradas por sección: `seccion1`, `seccion2`, ..., `seccion7`).
- Las columnas tipadas (`alumno_nombre`, `tiene_alergias`, etc.) son una denormalización de los campos críticos para queries rápidas y exports.
- El selector de horas de medicación (sección 4) almacena: `horarios: string[]` (ej. `["08:00", "14:00", "21:00"]`) + `prn: boolean`. Para compatibilidad con datos antiguos, los parsers aceptan también el formato legacy `frecuencia: string` libre.
- El teléfono internacional se almacena concatenado: `+34600111222`. La UI separa prefijo y dígitos al editar.

### Buckets de Storage

| Bucket | Contenido | Path |
|---|---|---|
| `firmas` | PNGs de firma manuscrita | `<expediente_id>/<tipo>.png` |
| `documentos` | Foto del niño, vacunación, receta médica | `<expediente_id>/<tipo>/<uuid>.<ext>` |

Ambos privados; URLs firmadas con caducidad de 10 minutos.

### RLS resumida

| Tabla | Familia | Clienta | Staff/Admin |
|---|---|---|---|
| `expedientes` | SELECT/INSERT/UPDATE solo los suyos (`user_id = auth.uid()`), no si `cerrado` | SELECT/INSERT/UPDATE/DELETE todos (filtro por edición en API) | SELECT/INSERT/UPDATE/DELETE todos |
| `invitaciones` | SELECT solo donde su email coincide | ALL | ALL |
| `datos_clienta` | sin acceso | ALL | ALL |
| `firmas`, `documentos`, `eventos` | SELECT/INSERT propios | ALL | ALL |
| `clienta_emails`, `staff_emails` | sin acceso | leer su propia fila (autenticado) | leer todo |

---

## 5. Stack técnico

| Capa | Decisión | Notas |
|---|---|---|
| Frontend | **Vite 5 + React 18 + TypeScript** | SPA. React Router 7. |
| Estilos | **Tailwind CSS v4** | Plugin Vite, mobile-first. |
| Formularios | **React Hook Form + Zod 4** | Validación tipada + autosave con debounce. |
| BD + Auth + Storage | **Supabase** | Postgres con RLS, magic link + password auth, buckets privados. |
| Firma manuscrita | **signature_pad** | Canvas → PNG → Supabase Storage. |
| Excel | **exceljs** | Carga dinámica (~940 KB), no entra en bundle principal. |
| PDF | **jsPDF + jspdf-autotable** | Carga dinámica (~400 KB). Sustituye al anterior `docx` (eliminado). |

---

## 6. Arquitectura y rutas

### Decisión de rol en la entrada

Cuando un usuario aterriza en `/` o `/callback`, el sistema consulta en paralelo `staff_emails` y `clienta_emails` con su email autenticado y redirige:

- Si está en `staff_emails` → `/admin`
- Si está en `clienta_emails` → `/clienta`
- En caso contrario → `/mis-expedientes` (familia)

La RLS en BD blinda el resto: aunque alguien fuerce una URL fuera de su rol, las queries fallan.

### Mapa de rutas

```
Públicas
  /                                       Landing (login email+pwd + magic link recovery)
  /mensaje-enviado                        "Te hemos mandado el email"
  /callback                               Post magic link → redirige por rol

Familia
  /mis-expedientes                        Lista de hijos inscritos
  /expediente/:id                         Formulario 7 secciones

Clienta
  /clienta                                Dashboard con lista + 2 acciones
  /clienta/nuevo                          Form alta niño
  /clienta/importar                       Subir Excel

Admin
  /admin                                  Lista filtrable + acciones + exports + log
  /admin/expediente/:id                   Detalle + panel gestión + panel edición + datos clienta
  /admin/expediente/:id/editar            Form 7 secciones en modo admin
  /admin/invitaciones                     Legacy: subir Excel + envío masivo (sigue funcionando)
  /admin/staff/nuevo                      Alta de miembro del staff del Campus
  /admin/recordatorios                    Reenvío selectivo de magic link a pendientes
```

---

## 7. Estructura del proyecto

```
FRP/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig*.json
├── eslint.config.js
├── .env.example
├── .env.local                       Claves Supabase (gitignored)
│
├── scripts/
│   ├── generate-test-excel.mjs      Genera test-data/familias-test.xlsx
│   └── provision-clienta.mjs        Provisiona el user de la clienta vía Admin API
│
├── test-data/
│   └── familias-test.xlsx
│
├── supabase/
│   ├── migrations/                  24 migraciones (orden estricto)
│   └── scripts/
│       ├── cleanup_test_data.sql    Reset destructivo
│       ├── diagnostico_clienta_login.sql
│       └── wipe_y_recrear_clienta.sql
│
└── src/
    ├── main.tsx                     Router
    ├── index.css
    │
    ├── lib/
    │   ├── supabase.ts              Cliente Supabase único
    │   ├── useSession.ts            Hook de sesión
    │   ├── useStaffStatus.ts        ¿Soy staff/admin?
    │   ├── useClientaStatus.ts      ¿Soy clienta?
    │   └── useAutosave.ts           Debounced save + flush on unmount
    │
    ├── components/
    │   ├── RequireAuth.tsx
    │   └── ui/
    │       ├── BarraProgreso.tsx
    │       ├── ErrorBanner.tsx
    │       ├── IndicadorGuardado.tsx
    │       └── PageSpinner.tsx
    │
    ├── routes/
    │   ├── public/
    │   │   ├── Landing.tsx                  Login + recuperar magic link
    │   │   ├── MensajeEnviado.tsx
    │   │   ├── Callback.tsx                 Post magic link, decide rol
    │   │   └── MisExpedientes.tsx           Lista familia
    │   │
    │   ├── backoffice/
    │   │   ├── BackofficeList.tsx           Lista + filtros + exports + log + acciones múltiples
    │   │   ├── BackofficeDetalle.tsx        Detalle + gestión + edición + datos clienta
    │   │   ├── BackofficeInvitaciones.tsx   Legacy: Excel upload + envío masivo
    │   │   ├── AdminNuevoStaff.tsx          Alta miembro staff del Campus
    │   │   └── AdminRecordatorios.tsx       Reenvío selectivo de magic links
    │   │
    │   └── clienta/
    │       ├── ClientaDashboard.tsx
    │       ├── ClientaNuevoNino.tsx
    │       └── ClientaImportarExcel.tsx
    │
    └── features/
        ├── expediente/
        │   ├── api.ts                       Tipos + funciones BD para todos los roles
        │   ├── secciones.ts                 Config de las 7 secciones
        │   ├── validacion.ts                Faltantes + helpers
        │   ├── firmaService.ts              Upload + textos firma
        │   ├── textosLegales.ts             Decálogo + reglamento
        │   ├── FormularioExpediente.tsx     Container con navegación (familia o admin)
        │   ├── Seccion1Datos.tsx
        │   ├── Seccion2Familia.tsx          Tutor + contactos con selector de prefijo
        │   ├── Seccion3Salud.tsx
        │   ├── Seccion4Medicacion.tsx       Selector de horas + PRN
        │   ├── Seccion5Conociendote.tsx
        │   ├── Seccion6Autorizaciones.tsx
        │   ├── Seccion7Revision.tsx         Firmas + modo confirmación postenvío
        │   ├── ExpedienteEnviadoView.tsx    Con botón "Modificar formulario"
        │   ├── FileUpload.tsx
        │   ├── FotoUpload.tsx
        │   └── SignatureCanvas.tsx
        │
        └── backoffice/
            ├── excelExport.ts               .xlsx con fallback a jsonb (función disponible, no en UI)
            ├── pdfExport.ts                 Cocinero, sanitario (oculto), médico, log
            └── invitacionesImport.ts        Parser de Excel reutilizado por clienta y admin
```

---

## 8. Desarrollo local

### Requisitos

- Node ≥ 20.18 (probado en 20.18.1).
- Proyecto Supabase con migraciones 0001-0024 aplicadas.

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

# Solo si vas a correr scripts/provision-clienta.mjs:
SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Dashboard → Settings → API → service_role)
```

### Comandos

```bash
npm run dev        # http://localhost:5173
npm run build      # type-check + producción
npm run preview    # sirve el build
npm run lint
```

---

## 9. Migraciones

Aplicar en orden (Supabase Dashboard → SQL Editor → pegar y Run):

| # | Archivo | Qué hace |
|---|---|---|
| 0001 | `init.sql` | Esquema base: enum estado, tablas (expedientes, medicaciones, firmas, documentos, eventos, recordatorios), trigger updated_at, RLS familia, buckets `firmas` y `documentos`. |
| 0002 | `eventos_insert.sql` | Política para que la familia inserte eventos. |
| 0003 | `campus_edicion.sql` | Tabla `campus_edicion` con seed + columnas extra en expedientes. |
| 0004 | `firmas_multi.sql` | Múltiples firmas por expediente. |
| 0005 | `fix_rls_envio.sql` | USING y WITH CHECK separados para transición a `enviado`. |
| 0006 | `staff_access.sql` | Tabla `staff_emails`, función `is_staff()`, políticas SELECT staff. |
| 0007 | `add_admin.sql` | Añade `marc.huguet.e@gmail.com` como admin. |
| 0008 | `backfill_columnas.sql` | Backfill desde `respuestas`. |
| 0009 | `gestion_interna.sql` | Columna `observaciones_internas` + RLS UPDATE staff. |
| 0010 | `invitaciones.sql` | Tabla `invitaciones`, `datos_clienta`, función `reclamar_invitaciones()`, columna `programa`. |
| 0011 | `fix_race_reclamar.sql` | `FOR UPDATE SKIP LOCKED` en `reclamar_invitaciones`. |
| 0012 | `invitaciones_fk_set_null.sql` | ON DELETE SET NULL en FK. |
| 0013 | `campus_2026.sql` | Campus Julio 2026. |
| 0014 | `confirmacion_imagen.sql` | Columnas `imagen_confirmada_at/por`. |
| 0015 | `invitaciones_unique.sql` | Unique index en invitaciones. |
| 0016 | `pago_envio.sql` | Columnas `pagado_at/por`, `formulario_enviado_at/por`. |
| 0017 | `clienta_role.sql` | Tabla `clienta_emails`, `is_clienta()`, RLS clienta, `user_id` nullable, `numero_participante` con trigger, `reclamar_invitaciones` actualizado. |
| 0018 | `provision_clienta_auth.sql` | Crea el usuario `mhuguet@robotix.es` en auth.users (idempotente). |
| 0019 | `reset_clienta_login.sql` | Reset destructivo para reprovisionar el login si hay problemas. |
| 0020 | `tipo_expediente.sql` | Columna `tipo` (estudiante/staff). |
| 0021 | `numero_por_tipo.sql` | Trigger numera independientemente: estudiantes `FRP-…`, staff `STF-…`. |
| 0022 | `staff_insert_expedientes.sql` | Policy INSERT y DELETE para staff (faltaba en 0009). |
| 0023 | `eventos_globales.sql` | `eventos.expediente_id` nullable para eventos `pdf_generado`. |
| 0024 | `familia_edita_postenvio.sql` | RLS familia permite UPDATE en cualquier estado salvo `cerrado` + columna `modificado_postenvio_at`. |

---

## 10. Provisión de usuarios

### Admin

Tras aplicar migración 0007, `marc.huguet.e@gmail.com` está en `staff_emails`. Para crear su usuario auth con password:

```sql
update auth.users
set encrypted_password = crypt('Robotix2026!', gen_salt('bf'))
where email = 'marc.huguet.e@gmail.com';
```

Si no existe el usuario aún, créalo desde Supabase Dashboard → Authentication → Add User (auto-confirm).

### Clienta

Tras aplicar migraciones 0017 y 0018, debería estar todo listo. Si por algún motivo falla el login, hay dos caminos:

**Opción 1 — Script Node.js (recomendado)**:

```bash
# Añade SUPABASE_SERVICE_ROLE_KEY a .env.local primero
node scripts/provision-clienta.mjs
```

El script usa la Admin API REST de Supabase (no el SDK, que tiene un bug con WebSockets en Node 20) para crear el usuario limpiamente. Es idempotente.

**Opción 2 — SQL**:

Ejecuta `supabase/scripts/wipe_y_recrear_clienta.sql` en el SQL Editor. Borra cualquier rastro previo en `auth.users` y tablas relacionadas (refresh_tokens, sessions, identities, etc.) y vuelve a crear desde cero. Útil si hay residuos de tests previos.

Credenciales por defecto:
- Email: `mhuguet@robotix.es`
- Password: `123456` (cámbialo en producción)

---

## 11. Configuración de email para producción (Resend)

Supabase por defecto envía emails con un rate limit muy bajo (~4/hora), solo apto para testing. Para producción, conectar un proveedor SMTP externo.

**Resend** (recomendado): https://resend.com — gratis hasta 3000 emails/mes.

### Pasos

1. **Crear cuenta** en Resend (cualquier email vale, no tiene que ser del dominio que verifiques).
2. **Verificar un dominio** (recomendado: subdominio dedicado tipo `mail.robotix.es`):
   - En Resend → Domains → Add Domain.
   - Añade los 3-4 registros DNS (1 TXT/SPF + 3 CNAME/DKIM, opcional 1 TXT/DMARC) en tu registrador.
   - Espera propagación (5 min – 48 h) y pulsa Verify.
3. **Crear API key** en Resend → API Keys → Create → "Sending access". Copia (`re_...`).
4. **Configurar SMTP en Supabase** → Project Settings → Authentication → SMTP Settings:
   - Enable Custom SMTP: ON
   - Sender email: `noreply@mail.robotix.es`
   - Sender name: `Campus FRP`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend` (literal)
   - Password: la API key
5. **Subir rate limits** en Authentication → Rate Limits.
6. **(Opcional)** Personalizar plantilla HTML en Authentication → Email Templates → Magic Link.

### Sesión de las familias

Con `persistSession: true` (default en nuestro setup), la sesión de la familia vive indefinidamente en `localStorage` mientras la familia abra la app cada cierto tiempo. En Dashboard → Authentication → Sessions:

- **Inactivity timeout**: 90 días recomendado.
- **JWT expiry**: 3600s (1h) default.

Una familia que rellena el día 1 puede volver a editar el día 60 sin necesidad de nuevo magic link si usa el mismo navegador. Si cambia de dispositivo o limpia datos, pide nuevo link desde `/` (botón "Familia que perdió el enlace").

---

## 12. Testing desde cero

### 1. Limpiar BD

```
supabase/scripts/cleanup_test_data.sql
```

Borra invitaciones, expedientes (cascada a firmas/documentos/eventos/datos_clienta) y usuarios de auth excepto admin y clienta.

### 2. Asegurar credenciales

```sql
update auth.users
set encrypted_password = crypt('Robotix2026!', gen_salt('bf'))
where email = 'marc.huguet.e@gmail.com';
```

Y `node scripts/provision-clienta.mjs` para la clienta.

### 3. Probar como clienta

1. `npm run dev` → http://localhost:5173 → login con `mhuguet@robotix.es` / `123456` → entras en `/clienta`.
2. Añade un niño manualmente o sube `test-data/familias-test.xlsx`.
3. Verifica que aparece con código `FRP-2026-001`.

### 4. Probar como admin

1. Ventana incógnito → login con `marc.huguet.e@gmail.com` / `Robotix2026!` → entras en `/admin`.
2. Verás el niño que cargó la clienta. **Selecciona la fila** con su checkbox, click "✓ Marcar pagado".
3. Click "↗ Enviar formulario (1)". Comprueba el email del tutor.

### 5. Probar como familia

1. Otra ventana incógnito → clic en el magic link recibido.
2. Aterrizas en `/callback` → se enlaza el `user_id` al expediente que creó la clienta.
3. Si solo hay un hijo, va directo al formulario.
4. Rellena las 7 secciones, prueba validación de DNI/teléfono/peso/horas medicación/firmas, envía.

### 6. Probar modificación tras envío

1. Como familia, vuelve a entrar a su expediente.
2. Ve la pantalla "Enviado". Pulsa "✎ Modificar formulario".
3. Cambia algo en una sección → autosave dispara.
4. Vuelve a Sección 7. Verifica modo confirmación ámbar.
5. Re-firma y pulsa "Confirmar cambios".

### 7. De vuelta como admin

1. Refresca `/admin`. Verifica que el badge "Modificado dd/mm" aparece y luego desaparece tras la confirmación.
2. Abre el detalle. Prueba cambiar estado, editar datos básicos, **anular confirmación de pago**, abrir el formulario completo en modo admin.
3. Genera Cocinero, Médico. Verifica los nombres de archivo incluyen tipo + programa.
4. Descarga el Log (PDF) y comprueba que aparece el envío del formulario y las generaciones de PDF.

---

## 13. Deploy a producción

### Contexto

FRP vivirá como **subpath** del portal interno de Robotix (`herramientas.robotix.es/frp`), embebido en iframe. Cada app del portal tiene su propio proyecto Supabase y auth independiente.

### Cambios pendientes para subpath

1. **`vite.config.ts`**: `base: '/frp/'`.
2. **React Router**: `createBrowserRouter(routes, { basename: '/frp' })` en `main.tsx`.
3. **Magic link**: cambiar `emailRedirectTo` a la URL de producción.
4. **Supabase URL Configuration**: Site URL + Redirect URLs apuntando a `herramientas.robotix.es/frp/**`.
5. **Email template del magic link**: verificar tras deploy.

### Build

```bash
npm run build
# salida en dist/
```

Servir `dist/` desde la infraestructura de Robotix.

---

## 14. Decisiones de producto

### Validación y UX

- **No/Sí sin selección por defecto** en preguntas críticas: obliga a marcar conscientemente.
- **Validación estricta al pulsar Siguiente**, no al escribir: banner tras intento, no mientras tipea.
- **Sección 5 (Conociéndote) lenient en texto libre**: radios obligatorias, las preguntas largas pueden quedar vacías. Es informativa, no crítica.
- **Hermanos con mismo email** comparten `user_id`: un tutor puede tener N expedientes.
- **El texto de autorización se guarda como snapshot inmutable**: las firmas existentes conservan lo que la familia leyó aunque luego se cambie el copy.
- **No persistencia entre ediciones**: cada año se rellena de cero, sin pre-fill.
- **Tutor firma de puño**, niño escribe su nombre en un input de texto.
- **Selector de horas para medicación** en lugar de texto libre: garantiza que el documento médico por horario funcione siempre.
- **Selector de prefijo internacional** para teléfonos: España default + 14 países.

### Sistema de inscripciones

- **La clienta nunca envía nada a las familias**: solo carga info básica. El admin decide cuándo enviar el formulario tras confirmar el pago.
- **La clienta solo ve estudiantes**: la API filtra su dashboard por `tipo='estudiante'`. Los staff que crea el admin son invisibles para ella.
- **El admin confirma pago manualmente** marcando un checkbox. No hay integración con pasarela de pago — la transferencia/factura se gestiona fuera del sistema.
- **Patrón de selección + acción**: el checkbox de "Pagado" pasó a ser una selección multi-fila + botones de acción ("Marcar pagado", "Enviar sin pago"). Permite marcar batch y reduce clics.
- **Flujo "enviar sin pago"** (botón gris secundario) para casos transitorios donde el pago llega después del envío. Registra evento con payload `bypass_pago: true` para auditoría.
- **Anulación de pago**: el admin puede revertir un pago marcado por error desde el detalle del expediente, con confirmación y evento `pago_revertido`.
- **El checkbox Pagado solo se desbloquea con anulación explícita**: una vez `pagado_at` está fijado, no se toggle automáticamente — solo se revierte vía el botón rojo del detalle.
- **Numeración separada estudiantes/staff** (`FRP-…` vs `STF-…`): contadores independientes, distinguibles a simple vista.
- **Race protection** en `reclamar_invitaciones` vía `FOR UPDATE SKIP LOCKED`.
- **Datos privados de la clienta** (importe, profesiones, chozo, observaciones) en tabla separada `datos_clienta` con RLS staff/clienta-only.

### Familia: modificación post-envío

- **Permitir modificar después de enviar** (Fase 3b) en lugar de bloquear: realidad operativa — la gente comete erratas, cambia teléfonos, etc.
- **Banner ámbar + badge en admin** para que la modificación sea visible y trazable.
- **Re-firma obligatoria** en Sección 7 tras modificación: garantía legal de que las firmas reflejan los datos actuales.
- **Estado del expediente no cambia** durante la modificación: sigue siendo `enviado`. Solo `cerrado` bloquea.

### Derechos de imagen (decisión estratégica)

Objetivo: maximizar consentimiento informado sin coacción.

- **Opción "Parcial" eliminada**: solo Sí o No.
- **Tres capas**:
  1. **Antes de elegir**: caja azul informativa explicando las implicaciones.
  2. **Después de elegir "No"**: caja ámbar con recordatorio suave, una sola vez.
  3. **Después del envío**: badge ámbar en el backoffice; el equipo contacta humanamente y registra confirmación.
- **No hay email automático de "¿estás seguro?"**: el contacto humano es más efectivo.
- **Cumple RGPD**: consentimiento libre, informado, específico, inequívoco.

### Login y sesión

- **Familias**: magic link sin contraseña (cero fricción, mejor para uso una sola vez). Sesión persistente en localStorage.
- **Staff y Clienta**: email + contraseña (más rápido para uso diario). Misma pantalla `/`, redirige por rol.
- **Sesión persistente** salvo logout explícito.
- **Decisión de no usar password para familias**: el uso es esporádico (1-2 veces al año). Añadir contraseña aumentaría más fricción inicial y soporte por recuperación que la que ahorraría.

### Documentos

- **Eliminada generación .docx**. Solo PDFs vía jsPDF (~400 KB con autotable, dinámicamente importado).
- **Nombre de archivo informativo**: incluye edición, doc, tipo (estudiantes/staffs/todos), programa, fecha.
- **Sanitario (PDF) y Excel general retirados del UI** por decisión de producto. Las funciones siguen en código por si se reañaden.

---

## 15. Roadmap

### Completado

- ✅ Formulario familia 7 secciones (autosave, validación, firmas, foto obligatoria, validación DNI/teléfono/peso, selector de prefijo internacional, selector de horas para medicación).
- ✅ Backoffice: lista filtrable (tipo + estado + programa), detalle, gestión interna, panel de confirmación imagen, panel de edición rápida + formulario completo en modo admin.
- ✅ Documentos PDF (cocinero, médico) con detección automática de tipo + programa en filename. (Sanitario y Excel disponibles en código pero retirados del UI por decisión de producto.)
- ✅ Carga masiva de familias desde Excel (legacy + nueva vía clienta).
- ✅ Sistema de roles diferenciado: admin / clienta / familia + tipo expediente estudiante/staff.
- ✅ Dashboard de la clienta con alta uno a uno o vía Excel.
- ✅ Alta de miembros del staff del Campus desde el admin (`STF-…`).
- ✅ Workflow de pago manual + envío manual del formulario (pago primero) por el admin.
- ✅ Workflow alternativo "enviar sin pago" para casos transitorios donde el pago llega después.
- ✅ Anulación de pago marcado por error desde el detalle.
- ✅ Patrón multi-select para acciones batch (marcar pagado, enviar sin pago).
- ✅ Recordatorios selectivos a familias retrasadas.
- ✅ Log de actividad PDF acumulativo (formularios enviados + PDFs generados).
- ✅ Decisión de eliminar opción "Autorizo parcialmente" en derechos de imagen.
- ✅ Modificación del formulario por la familia tras envío (con re-firma cuando aplica) + badge visible para el admin + eventos registrados.
- ✅ Observaciones de la clienta + visualización en panel del admin (bloque "Datos de la clienta").
- ✅ Parser de Excel tolerante: ignora columnas no reconocidas, error claro si el archivo tiene imágenes/decoración.
- ✅ Login neutro (admin + clienta usan la misma pantalla "/").
- ✅ Clienta solo ve estudiantes en su dashboard (staff queda invisible para ella).

### Pendientes priorizados

| Prioridad | Tarea | Impacto |
|---|---|---|
| Alta | **Configurar Resend** en producción. | Necesario para envío real a 75 familias sin tropezar con rate limit. |
| Alta | **Email automático al admin cuando familia modifica tras envío**. | Hoy queda solo como badge + evento en log. Requiere Resend o equivalente. |
| Media | **Aviso por email al equipo** cuando llega un expediente nuevo. | Cierre del ciclo de feedback (Edge Function + Resend). |
| Media | **PDF por expediente individual** para imprimir/archivar (con firmas embebidas). | Casos de archivo y notificación. |
| Media | **Documentos por rol adicionales**: docente (actitud, miedos) y ocio (habilidades, motrices). | Más equipos sin filtrar a mano. |
| Media | **Roles diferenciados en backoffice** (cocina solo dietas, ocio solo habilidades). | Privacidad + reducción de ruido. |
| Media | **Estado visible para la familia** en `/mis-expedientes`. | Menos consultas tipo "¿lo habéis recibido?". |
| Media | **Anular envío** de formulario erróneo desde la UI. | Hoy requiere SQL directo (similar a "anular pago" pero para envío). |
| Baja | **UI de gestión de ediciones**: crear edición desde la app sin SQL. | Cuando lleguen ediciones distintas. |
| Baja | **Email custom para recordatorios** (con deadline, plantilla bonita) vía Resend. | Hoy el recordatorio reenvía el mismo magic link. |
| Baja | **Recordatorios automáticos** por cron (Edge Function programada). | Reduce seguimiento manual. |
| Baja | **Historial de cambios** (qué campo cambió, antes/después). | Solo si se necesita auditoría profunda. |
| Baja | Auditoría server-side de firmas (IP / user agent). | Si surge requisito legal. |

### Decisiones descartadas explícitamente

- **Reutilización de datos entre ediciones**: cada año se piden de cero.
- **Firma electrónica certificada**: no necesaria; firma manuscrita suficiente.
- **Versión papel del formulario**: todas las familias online desde 2017 sin incidencias.
- **SSO real entre apps del portal**: cada Supabase project es independiente.
- **Opción "Autorizo parcialmente"** en derechos de imagen.
- **Pop-up insistente al decir No en derechos de imagen**: presión indebida.
- **Email "¿estás seguro?" tras envío**: la confirmación humana del equipo es más efectiva.
- **Login con contraseña para familias**: añade fricción y soporte para una mejora marginal.
- **Generación de documentos en Word**: simplificado a solo PDF.
- **Historial completo de cambios campo a campo**: ruido excesivo para el valor que aporta.
- **Cooldown forzado entre recordatorios**: el admin se autodisciplina con el "último recordatorio: hace X d".

---

## Estado actual del proyecto

Aplicación funcional de extremo a extremo en local. Lista para:

- Validar el copy del formulario con el equipo.
- Coordinar con la clienta el formato exacto del Excel de inscritos.
- Configurar Resend en producción.
- Deploy a la infraestructura del portal de Robotix.

Las funcionalidades pendientes (PDF por expediente, aviso al equipo, recordatorios automáticos, docs adicionales) son extensiones del sistema actual y no requieren cambios estructurales.
