# PLAN DE IMPLEMENTACIÓN — SaaS COTA CERO (Presupuestador)

## Cómo usar este documento

Este plan lo ejecuta un agente de código (Claude Sonnet en Claude Code, o Codex) **una
fase por vez, con revisión humana entre fases**. No es un proceso desatendido.

**Para cada fase, pegale al agente:**
1. La sección **«CONTEXTO GLOBAL»** completa (siempre, en toda sesión nueva).
2. La fase que toca (solo esa).

**Reglas para vos (Pablo):**
- No dispares la fase siguiente sin completar el **Checkpoint** de la actual.
- Las fases marcadas 🛑 **ALTO OBLIGATORIO** tocan dinero o datos reales: ahí probás
  todo con datos de prueba primero y no seguís sin verificación explícita.
- Si el agente propone desviarse del plan (otra librería, otro esquema), la respuesta
  default es **no** — las decisiones ya están tomadas acá.

**¿Sonnet o Codex?** Para este proyecto es mayormente indistinto. Recomendación fina:
- **Fases 2, 8 y 9** (reglas de negocio, cuenta corriente, importación de datos reales):
  usá **Sonnet** — son las fases donde un error es caro y conviene el modelo que mejor
  sigue especificaciones largas con validaciones.
- **Resto de las fases** (setup, CRUD, UI, PDF, deploy): cualquiera de los dos.
- Si podés, usá el mismo agente en todo el proyecto para consistencia de estilo.

---

# CONTEXTO GLOBAL (pegar siempre al inicio de cada sesión)

## Qué es este proyecto

App interna de presupuestos para COTA CERO (empresa de pisos, La Plata, Argentina).
Reemplaza un sistema en Google Apps Script + Sheets. Entidades: **catálogo de precios**,
**clientes**, **presupuestos versionados con ítems**, **cuenta corriente (movimientos
debe/haber)**. 2–4 usuarios internos, sin roles (todos pueden todo), sin signup público.
Idioma de la UI y de los nombres de dominio: **español**.

## Stack (decidido — no cambiar)

- **Next.js** (App Router) + **TypeScript estricto** + **Tailwind CSS**
- **Firebase**: Firestore + Auth (email/password, cookie de sesión) + Storage (privado)
- **`firebase-admin`** en el servidor: **TODAS las escrituras a Firestore pasan por
  server actions** — el navegador solo lee. Las operaciones de dinero usan
  `runTransaction`.
- **Firebase Emulator Suite** para desarrollo local (Firestore + Auth + Storage)
- **@react-pdf/renderer** para PDFs (presupuestos y recibos)
- **Vitest** para tests unitarios de reglas de negocio
- Hosting: **Netlify** (runtime oficial de Next.js). Repo: GitHub.
- No agregar otras librerías sin necesidad demostrada. Nada de ORMs.

## Estructura de carpetas

```
app/
  (auth)/login/
  clientes/
  catalogo/
  presupuestos/         # listado, [id] detalle, nuevo, [id]/editar
  cuenta-corriente/
  api/pdf/
lib/
  firebase/             # client.ts (navegador), admin.ts (server), sesion.ts
  tipos.ts              # tipos TS de todas las colecciones (fuente de verdad)
  reglas/               # funciones puras + tests (*.test.ts)
  acciones/             # server actions (clientes, presupuestos, cuentaCorriente...)
  pdf/                  # PresupuestoPDF.tsx, ReciboPDF.tsx
firestore.rules         # lectura autenticada, escritura denegada al cliente web
firestore.indexes.json  # índices compuestos, versionados
storage.rules
scripts/
  seed.ts               # datos ficticios → emulador
  import/               # importadores CSV (corren local con service account)
  reconciliar.ts        # recalcula saldos desde movimientos vs. campo denormalizado
```

## Modelo de datos (Firestore — resumen; detalle en ARQUITECTURA.md)

Firestore NO tiene constraints únicos, secuencias ni checks: la unicidad y la numeración
se garantizan **por diseño** con transacciones (ver R6 y R9). Los ítems del presupuesto
van **embebidos** en el doc del presupuesto.

- `usuarios/{uid}`: nombre, email, rol ('usuario'), activo.
- `clientes/{CLI-0001}` (doc ID = código): nombre, telefono (8–13 dígitos),
  telefonoNormalizado (solo dígitos), email, direccion, localidad, tipo, cuitDni,
  condicionIva, origen, notas, estado ('Activo'|'Inactivo'), **saldo (denormalizado —
  solo lo tocan las transacciones de movimientos)**, fechaAlta, timestamps.
- `catalogo/{autoId}`: codigo, rubro, nombre, unidad, especificacion, precioLista,
  precioFinalIva, moneda ('Pesos'|'Dolar'), estado, grupoContable
  ('materiales'|'mano_obra'|'accesorios'), m2PorCaja, requiereVerificacion.
- `obras/{COTA-2026-0001}` (doc ID = código): anio, numero, clienteId, clienteNombre,
  **ultimaVersion** (contador transaccional de versiones).
- `presupuestos/{autoId}`: obraCodigo, version, clienteId + snapshots (clienteNombre,
  telefono), direccionObra, tipoObra, vendedor, fechaVisita, fechaEmision, m2Relevados,
  subpiso, nivelSubpiso, observacionesRiesgos, modalidad
  ('integrada'|'colocacion'|'materiales'), formaPago, validez, moneda, exclusiones,
  estado ('Emitido'|'Confirmado'|'Anulado'|'Superado'), tcUsdSnapshot,
  **items[]** = { catalogoId|null, codigo, nombre, rubro, unidad, cantidad,
  precioUnitario, subtotal, grupoContable, esManual, grupoContableExplicito,
  requiereVerificacion, orden }, subtotalMateriales, subtotalManoObra,
  subtotalAccesorios, total, esLegado, linkPdfLegado, pdfPath, creadoPor, timestamps.
- `movimientos/{autoId}`: codigo `MOV-000001`, fechaHora, clienteId, clienteNombre,
  tipo ('CONFIRMACION_PRESUPUESTO'|'PAGO'|'ANULACION_PRESUPUESTO'|'ANULACION_PAGO'|'AJUSTE'),
  presupuestoId|null, codigoObra + versionPresupuesto (snapshot), concepto, debe, haber
  (≥ 0), medioPago, referencia, **motivo (obligatorio en anulaciones y ajustes —
  validado en el server)**, movAnuladoId|null, reciboPath, notas, creadoPor.
  **Nunca se editan ni borran: solo se agregan reversos.** Cada movimiento actualiza
  `clientes.saldo` en la misma transacción.
- `contadores/{nombre}` ({ ultimo }): `clientes`, `movimientos`, `obras-{anio}`.
- `config/general`: tcUsd, validezDefault, datos de membrete.
- Consultas clave: saldos globales = `clientes where saldo != 0`; historial con saldo
  acumulado = movimientos del cliente por fechaHora + acumulado calculado en el cliente.
- **Reglas de seguridad**: Firestore y Storage → lectura solo autenticados, escritura
  denegada al cliente web (todo escribe el server con admin SDK).

## Reglas de negocio (fuente de verdad — implementar EXACTAMENTE así)

### R1 — Normalización de texto
`normalizar(s)`: minúsculas + quitar acentos/diacríticos + trim. Se usa en clasificación
y comparación de nombres.

### R2 — Clasificación rubro → grupo contable
Sobre el rubro normalizado, evaluar **EN ESTE ORDEN** (el orden importa: "lijado" debe
caer en mano_obra aunque contiene "lija", keyword de accesorios):
1. Contiene `flete` → **accesorios**
2. Contiene `servicio`, `coloc`, `restaur` o `lijado` → **mano_obra**
3. Contiene `adhesivo`, `accesorio`, `insumo`, `manta`, `varilla`, `lija`, `hidrolaca`,
   `laca`, `terminacion`, `fenolico`, `zocalo`, `clip`, `tornillo`, `perfil`, `angulo`,
   `cuarta` o `cubre` → **accesorios**
4. Cualquier otro caso → **materiales**

**Excepción:** si el ítem es manual (`esManual`) y el usuario eligió grupo explícito
(`grupoContableExplicito = true`), ese valor manda sobre la clasificación automática.

### R3 — Modalidades (qué grupos entran al total)
- `integrada` → materiales + mano_obra + accesorios
- `colocacion` → mano_obra + accesorios (cliente pone materiales)
- `materiales` → materiales + accesorios (sin ejecución)

**TODOS los ítems cargados se guardan siempre**, incluidos los excluidos por modalidad.
Los subtotales por grupo se calculan sobre todos los ítems del grupo; el `total` suma
solo los subtotales de los grupos incluidos por la modalidad.

### R4 — Conversión USD (regla heredada, preservar tal cual)
Si `moneda = 'Dolar'` y `precioFinalIva < 5000`: precio en ARS = precio × `tcUsd`
(de `config/general`), y `requiereVerificacion = true`. Si es Dolar y ≥ 5000, no se
convierte. En el presupuesto, el TC usado queda congelado en `tcUsdSnapshot`.

### R5 — Extracción m²/caja
Del nombre o la especificación, extraer el valor entre paréntesis cuando exista:
`"(2,16 m2)"` → 2.16 · `"(3.16 x caja)"` → 3.16. Acepta coma o punto decimal, con
sufijo `m2`/`m²` o `x caja`. Si no hay match → null.

### R6 — Numeración (contadores transaccionales)
- Obra: `COTA-{año}-{NNNN}` (4 dígitos), autoincremental, **reinicia cada año** (cada
  año tiene su doc `contadores/obras-{anio}`).
- Cliente: `CLI-{NNNN}`. Movimiento: `MOV-{NNNNNN}`.
- Todo con `runTransaction` sobre `contadores/` — leer `ultimo`, incrementar, usar el
  número y crear el doc destino EN LA MISMA transacción. Sin locks manuales.

### R7 — Versionado de presupuestos
- Re-emitir para la **misma obra y mismo cliente** → nueva versión del mismo código
  (transacción que incrementa `obras.ultimaVersion`). Si el cliente es otro → obra
  nueva con versión 1.
- Editar in-place solo se permite mientras `estado = 'Emitido'`. Confirmado / Anulado /
  Superado son inmutables: solo se pueden **duplicar**.
- Duplicar: copia editable completa, sin alterar el original. El usuario elige: nueva
  versión de la misma obra (mismo cliente) u obra nueva (mismo u otro cliente). Al
  duplicar se ofrece el botón opcional "Actualizar precios desde catálogo", que refresca
  precios y marca visualmente qué ítems cambiaron. Editar NUNCA re-precia solo.

### R8 — Cuenta corriente (validaciones obligatorias)
- Saldo cliente = `sum(debe) − sum(haber)` de todos sus movimientos = campo
  `clientes.saldo` (denormalizado, actualizado en cada transacción de movimiento).
- **CONFIRMACION_PRESUPUESTO**: solo si estado = 'Emitido' y no existe confirmación
  activa para esa obra+versión. Registra `debe = total`. Pasa el presupuesto a
  'Confirmado' y todas las otras versiones 'Emitido' de la misma obra a 'Superado'.
  Todo en UNA transacción.
- **PAGO**: registra `haber`. Si supera el saldo deudor → la UI debe pedir confirmación
  explícita ("va a generar saldo a favor") antes de registrar. Genera recibo PDF con
  monto en letras (tipo cheque) y guarda `reciboPath`.
- **ANULACION_PRESUPUESTO**: motivo obligatorio. Encuentra la confirmación activa,
  registra el inverso (`haber`), vincula `movAnuladoId`, presupuesto → 'Anulado'.
- **ANULACION_PAGO**: motivo obligatorio. Inverso (`debe`) vinculado al pago. Un pago no
  se puede anular dos veces.
- **AJUSTE**: motivo obligatorio, debe o haber libre.
- Los movimientos NUNCA se editan ni borran: solo se agregan reversos.

### R9 — Clientes
- Alta rápida (desde el form de presupuesto): requiere nombre + teléfono (8–13 dígitos).
- Anti-duplicados por teléfono: dentro de la transacción de alta, consultar
  `clientes where telefonoNormalizado == X`; si existe → error con el nombre del
  cliente existente. (Firestore no tiene unique constraints — esta consulta EN la
  transacción del admin SDK es el mecanismo.)

## Convenciones de trabajo

- TypeScript estricto, sin `any` gratuitos. Nombres de dominio en español, campos
  Firestore en camelCase. Los tipos de `lib/tipos.ts` son la fuente de verdad del modelo.
- Cada regla de negocio de arriba vive en UNA función en `lib/reglas/` con tests.
- Toda escritura a Firestore pasa por `lib/acciones/` (server actions con admin SDK).
  El código del navegador nunca escribe.
- `firestore.rules` y `firestore.indexes.json` versionados; se deployan con
  `firebase deploy --only firestore:rules,firestore:indexes,storage`.
- Desarrollo local SIEMPRE contra los emuladores (`npm run dev` los levanta junto con
  Next). Producción solo se toca en deploys e importaciones.
- Commit al final de cada fase con mensaje `Fase N: <resumen>`.
- Al terminar la fase, listar qué se hizo y qué debe probar el humano (checkpoint).

---
---

# FASES

## FASE 0 — Setup del proyecto y deploy base

**Objetivo:** repo funcionando, Next.js corriendo, Firebase conectado (real + emuladores),
deploy en Netlify. Deployar desde el día uno hace que cada fase sea verificable en real.

**Tareas:**
1. `npx create-next-app@latest` (TypeScript, Tailwind, App Router, sin src/) en la raíz
   del proyecto. Inicializar git + repo GitHub.
2. Guiar a Pablo (paso a paso, es quien tiene las cuentas) para: crear el proyecto en la
   consola de Firebase, **activar plan Blaze con alerta de presupuesto (ej. USD 5/mes)**,
   habilitar Firestore, Auth (email/password) y Storage, y descargar la clave del
   service account. Env vars: config web de Firebase (`NEXT_PUBLIC_FIREBASE_*`) +
   `FIREBASE_SERVICE_ACCOUNT` (JSON en una línea) en `.env.local` (gitignoreado).
3. Instalar `firebase`, `firebase-admin` y Firebase CLI. `firebase init` para Firestore,
   Storage y emuladores. Crear `lib/firebase/client.ts` (navegador, conecta al emulador
   en dev) y `lib/firebase/admin.ts` (server, ídem).
4. Script `npm run dev` que levanta emuladores + Next juntos (concurrently).
5. Página placeholder que hace un ping a Firestore y muestra "Conectado ✓ / Error ✗".
6. Guiar a Pablo para conectar el repo a Netlify (runtime Next.js) con las env vars y
   deployar.

**Qué NO hacer:** nada de modelo de datos, nada de UI real, nada de auth todavía.

**Criterio de listo:** `npm run dev` corre local contra emuladores; la URL de Netlify
muestra "Conectado ✓" contra el Firestore real.

**✅ Checkpoint (liviano):** abrí la URL de Netlify y verificá el "Conectado ✓". Guardá
la clave del service account en un lugar seguro (NO en el repo). Verificá que la alerta
de presupuesto esté configurada. Aprobá y seguí.

---

## FASE 1 — Modelo de datos, reglas de seguridad y seed de prueba

**Objetivo:** tipos TS de todas las colecciones, reglas de Firestore/Storage deployadas,
helpers de numeración transaccional, y un seed de datos FICTICIOS en el emulador.

**Contexto:** el modelo completo está en «Modelo de datos» del CONTEXTO GLOBAL.
Implementarlo literal, sin agregar ni quitar campos.

**Tareas:**
1. `lib/tipos.ts`: tipos TS de TODAS las colecciones y del ítem embebido (fuente de
   verdad del modelo — copiar nombres exactos del CONTEXTO GLOBAL).
2. `firestore.rules`: lectura solo `request.auth != null`; **escritura `false`** en todas
   las colecciones (el server escribe con admin SDK, que bypasea reglas).
   `storage.rules`: todo denegado al cliente (URLs firmadas desde el server).
3. `firestore.indexes.json` inicial (movimientos por clienteId+fechaHora, presupuestos
   por clienteId+creadoEn, presupuestos por obraCodigo+version).
4. `lib/firebase/numeracion.ts`: `proximoCodigo(tx, 'clientes'|'movimientos'|'obras-{anio}')`
   — lee e incrementa `contadores/{nombre}` DENTRO de la transacción recibida (R6).
5. `scripts/seed.ts` (corre contra el emulador): 3 clientes, 10 ítems de catálogo (que
   cubran los 3 grupos contables y un caso USD < 5000), 1 obra con 2 versiones de
   presupuesto, `config/general` con `tcUsd = 1200`, contadores consistentes.
6. Deploy de reglas e índices al proyecto real (`firebase deploy --only ...`).

**Qué NO hacer:** NO server actions de negocio todavía (Fases 3+). NO UI. NO importar
datos reales. NO lógica de cuenta corriente (Fase 8).

**Criterio de listo:** seed corre limpio en el emulador; las reglas están deployadas en
el proyecto real; los tipos compilan con `tsc --noEmit`.

**✅ Checkpoint (liviano):** abrí la UI del emulador (localhost:4000) → Firestore y
verificá colecciones y datos de prueba. En la consola real de Firebase → Rules, verificá
que las reglas publicadas nieguen escritura. Aprobá y seguí.

---

## FASE 2 — Reglas de negocio puras + tests (la fase más importante de verificar)

**Objetivo:** todas las reglas R1–R8 (la parte calculable) como funciones puras en
`lib/reglas/`, cada una con tests unitarios en Vitest. Cero UI, cero base de datos.

**Tareas:** crear con tests:
1. `normalizar.ts` — R1. Tests: "Colocación" → "colocacion", "LIJADO Fino" → "lijado fino".
2. `clasificacion.ts` — `clasificarGrupoContable(rubro)` según R2, **respetando el orden**.
   Tests obligatorios: "Flete" → accesorios; "Servicio de colocación" → mano_obra;
   "Lijado" → mano_obra (¡no accesorios!); "Lija grano 40" → accesorios;
   "Hidrolaca" → accesorios; "Restauración" → mano_obra; "Pisos de madera" → materiales;
   ítem manual con grupo explícito 'materiales' y rubro "flete" → materiales (excepción).
3. `m2caja.ts` — `extraerM2PorCaja(nombre, especificacion)` según R5. Tests:
   "(2,16 m2)" → 2.16; "(3.16 x caja)" → 3.16; "(2,5 m²)" → 2.5; sin paréntesis → null.
4. `totales.ts` — `calcularTotales(items, modalidad)` según R3. Devuelve los 3 subtotales
   + total. Tests: una lista mixta con las 3 modalidades; ítems excluidos por modalidad
   no suman al total pero sí a su subtotal.
5. `precios.ts` — `precioEfectivo(item, tcUsd)` según R4 (conversión + flag). Tests:
   Dolar 100 con tc 1200 → 120000 + flag; Dolar 8000 → 8000 sin flag; Pesos → igual.
6. `montoEnLetras.ts` — número → texto en español para recibos. Tests: 1500 →
   "mil quinientos"; 1234567.89 → texto con centavos; 0 y montos con "un/uno" correctos.
7. `validaciones.ts` — `telefonoValido` (8–13 dígitos, R9), y helpers de estado de
   presupuesto (`puedeEditarse`, `puedeConfirmarse`, `puedeDuplicarse` según R7/R8).

**Qué NO hacer:** NO tocar Firestore ni la UI. NO server actions.

**Criterio de listo:** `npm test` verde con todos los casos listados arriba incluidos.

**✅ Checkpoint (liviano pero atento):** pedile al agente el output de los tests y leé los
nombres de los casos. Verificá especialmente que estén los tests "Lijado → mano_obra" y
la excepción del ítem manual. Estas funciones son el corazón del negocio. Aprobá y seguí.

---

## FASE 3 — Autenticación + CRUD de clientes

**Objetivo:** login funcionando y el módulo de clientes completo.

**Tareas:**
1. Login email/password con Firebase Auth (`/login`): el cliente se autentica, el server
   emite **cookie de sesión** (`lib/firebase/sesion.ts` con admin SDK), middleware
   protege todo lo demás, botón cerrar sesión. **Sin signup público** — usuarios se
   crean a mano en la consola de Firebase (guiar a Pablo para crear el suyo; en dev, el
   emulador de Auth permite crear usuarios de prueba).
2. Al primer login de un usuario, crear/actualizar su doc en `usuarios/{uid}`.
3. Layout base con navegación: Presupuestos · Clientes · Catálogo · Cuenta corriente.
4. `/clientes`: listado con búsqueda instantánea (nombre, código o teléfono), alta,
   edición, estado Activo/Inactivo (no borrar físico). Escrituras vía
   `lib/acciones/clientes.ts`: el alta es una transacción que (a) valida teléfono con
   `telefonoValido`, (b) chequea duplicado por `telefonoNormalizado` (R9), (c) toma el
   próximo código CLI (R6), (d) crea el doc.
5. Alta rápida como componente modal reutilizable (lo usa el form de presupuesto en
   Fase 5): nombre + teléfono mínimos, error de duplicado con mensaje claro
   ("Ya existe: <nombre>").
6. Ficha de cliente con sus datos + placeholder "Presupuestos" y "Cuenta corriente"
   (se completan en fases 6 y 8).

**Qué NO hacer:** NO presupuestos, NO catálogo, NO cuenta corriente, NO roles.

**Criterio de listo:** solo usuarios logueados acceden; CRUD completo funciona en el
emulador y en Netlify.

**✅ Checkpoint:** entrá con tu usuario. Cargá 3 clientes de prueba. Intentá cargar un
cuarto con el teléfono del primero → debe rechazarlo con mensaje claro. Verificá que los
códigos salgan correlativos (CLI-0001, 0002, 0003). Buscá por nombre parcial y por
teléfono. Aprobá y seguí.

---

## FASE 4 — Catálogo de precios + importación desde el Sheet PRECIOS

**Objetivo:** el catálogo vive en la app: pantalla de administración + importador del
CSV exportado del Sheet.

**Tareas:**
1. `/catalogo`: listado con búsqueda por nombre/código, filtros por rubro, estado y
   `requiereVerificacion`. Alta y edición de ítems (via `lib/acciones/catalogo.ts`).
   Al guardar, recalcular `grupoContable` (R2) y `m2PorCaja` (R5) con las funciones de
   `lib/reglas/`. Unicidad de código por consulta en la transacción.
2. Pantalla o sección de configuración: editar `tcUsd` y datos de membrete
   (`config/general`).
3. `scripts/import/import-catalogo.ts` (corre local con service account, apuntable a
   emulador o producción con flag explícito `--produccion`). Lee el CSV exportado de la
   hoja PRECIOS (columnas: codigo, rubro, nombre, unidad, precio_lista,
   precio_final_iva, estado, especificacion, moneda) y:
   - **Excluye** filas con estado ≠ "Habilitado", nombres que contengan "NO USAR",
     "SIN STOCK" o "Copia de", y códigos con patrón de fecha tipo `| 2025-02-03`
     (regex `\|\s*\d{4}-\d{2}-\d{2}`).
   - Aplica R4 (conversión USD + flag) y calcula grupo contable y m²/caja.
   - Modo `--dry-run` default: NO escribe, genera `reporte-import-catalogo.csv` con
     qué se importaría, qué se excluye y por qué, y qué queda flaggeado.
   - Modo `--ejecutar`: importa. Modo `--wipe`: borra catálogo antes (re-ejecutable).

**Qué NO hacer:** NO presupuestos todavía. NO importar clientes ni movimientos (Fase 9).

**Criterio de listo:** dry-run genera reporte legible; importación real puebla el
catálogo; la pantalla lista, filtra y edita.

**✅ Checkpoint (medio — primer contacto con datos reales, riesgo bajo porque no toca el
Sheet y es re-ejecutable):**
1. Exportá la hoja PRECIOS como CSV y corré el dry-run. Leé el reporte: ¿los excluidos
   tienen sentido? ¿cuántos quedan flaggeados por USD?
2. Corré la importación real (`--ejecutar --produccion`). En la app, buscá 10 productos
   que conozcas de memoria y compará precio y rubro contra el Sheet.
3. Filtrá por `requiereVerificacion` y revisá esos ítems (son los USD chicos
   probablemente mal cargados — corregilos ahora o después).
No sigas si los precios spot-checkeados no coinciden.

---

## FASE 5 — Presupuestos: creación (el formulario)

**Objetivo:** crear un presupuesto nuevo completo y persistirlo como entidad real.

**Tareas:**
1. `/presupuestos/nuevo`: formulario con:
   - Cabecera: autocomplete de cliente (+ alta rápida modal de Fase 3), teléfono,
     dirección de obra, tipo de obra, vendedor, fechas de visita/emisión, m² relevados,
     subpiso, nivel de subpiso, observaciones/riesgos.
   - Selector de modalidad (integrada / colocacion / materiales) — al cambiar, recalcula
     el total en vivo (R3) sin perder ítems.
   - Ítems: autocomplete del catálogo (por nombre o código, estilo rápido), cantidad
     (si el ítem tiene m2PorCaja, mostrar cajas + equivalencia m²), precio unitario
     editable (default el efectivo según R4 con el tcUsd vigente), subtotal en vivo.
   - Ítem manual: nombre/rubro/unidad/precio libres + **selector de grupo contable
     obligatorio** (`grupoContableExplicito = true`).
   - Ítems de grupos excluidos por la modalidad: se muestran atenuados con leyenda
     "no suma al total", pero SE GUARDAN.
   - Condiciones: forma de pago, validez, moneda, exclusiones/observaciones.
2. Guardar (`lib/acciones/presupuestos.ts`): UNA transacción que crea la obra (código
   vía contador anual R6, `ultimaVersion = 1`) + el presupuesto (version 1, estado
   'Emitido', `tcUsdSnapshot`, items embebidos con `orden`, subtotales y total
   calculados con `calcularTotales`).

**Qué NO hacer:** NO listado/edición/duplicado (Fase 6). NO PDF (Fase 7). NO cuenta
corriente. NO versionado todavía (todo lo creado acá es versión 1).

**Criterio de listo:** se crea un presupuesto de cada modalidad y queda persistido
completo (verificable en la UI del emulador), con numeración correlativa correcta.

**✅ Checkpoint:** creá 2 presupuestos de prueba (uno `integrada`, uno `colocacion`) con
ítems de los tres grupos + un ítem manual. Verificá con calculadora que los subtotales
por grupo y el total según modalidad den exacto. Verificá en la UI del emulador que los
ítems excluidos por modalidad también quedaron guardados dentro del doc. Aprobá y seguí.

---

## FASE 6 — Presupuestos: listado, detalle, edición, duplicado y versionado

**Objetivo:** el motivo central de la migración — reabrir, editar y duplicar cualquier
presupuesto.

**Tareas:**
1. `/presupuestos`: listado global con búsqueda/filtros (cliente, estado, año), agrupado
   por obra mostrando todas las versiones con su estado (badges Emitido / Confirmado /
   Anulado / Superado).
2. Ficha de cliente (Fase 3): completar la pestaña "Presupuestos" con su historial.
3. `/presupuestos/[id]`: detalle completo, solo lectura, con acciones según estado (R7):
   **Editar** solo si 'Emitido'; **Duplicar** siempre; legados (`esLegado`) muestran
   link al PDF original y NO se editan.
4. Editar: reabre el formulario de Fase 5 con TODO precargado (ítems, cantidades,
   precios ajustados, cabecera). Guarda sobre el mismo doc. **No re-precia nada.**
5. Duplicar: diálogo que pregunta destino — «Nueva versión de esta obra» (mismo cliente,
   transacción que incrementa `obras.ultimaVersion`, R7) u «Obra nueva» (mismo u otro
   cliente, código nuevo, versión 1). Abre el formulario precargado como borrador; botón
   opcional **"Actualizar precios desde catálogo"** que refresca `precioUnitario` desde
   el catálogo vigente y marca visualmente los ítems cuyo precio cambió (mostrando el
   anterior). Guardar crea el presupuesto nuevo sin tocar el original.

**Qué NO hacer:** NO PDF. NO confirmar/anular (eso es cuenta corriente, Fase 8 — acá los
estados solo se muestran).

**Criterio de listo:** flujo completo crear → editar → duplicar como nueva versión →
duplicar como obra nueva, con numeración y estados correctos.

**✅ Checkpoint:** agarrá un presupuesto de la Fase 5: (1) editalo (cambiá una cantidad,
guardá, reabrí: debe estar el cambio y nada re-preciado); (2) duplicalo como nueva
versión → debe ser v2 de la misma obra; (3) duplicalo como obra nueva para otro cliente
→ código nuevo v1; (4) probá "Actualizar precios": cambiá antes un precio en el catálogo
y verificá que lo marque como cambiado. Aprobá y seguí.

---

## FASE 7 — Generación de PDF del presupuesto

**Objetivo:** PDF con el mismo diseño/membrete que el sistema actual, guardado en
Storage y descargable.

**Contexto necesario de Pablo:** un PDF de muestra del sistema actual + el logo/membrete
en buena calidad. Sin esto el agente no puede empezar.

**Tareas:**
1. Plantilla `lib/pdf/PresupuestoPDF.tsx` con `@react-pdf/renderer` replicando el diseño
   actual: membrete, datos de obra y cliente, tabla de ítems (con cajas + m² cuando
   aplique), subtotales por grupo según modalidad, total, condiciones, validez.
2. Route handler `app/api/pdf/presupuesto/[id]/route.ts`: genera el PDF, lo sube con el
   admin SDK a Storage (path `presupuestos/{codigoObra}/v{version}.pdf`), guarda
   `pdfPath` en el doc, devuelve **URL firmada** de corta duración.
3. Botones "Generar PDF" / "Descargar PDF" en el detalle. Si el presupuesto se edita
   después de generado, indicar "PDF desactualizado — regenerar".
4. Verificar que la generación funcione deployada en Netlify (límites de tamaño/tiempo
   de la función), no solo local.

**Qué NO hacer:** NO recibos de pago todavía (Fase 8, reusa la infraestructura de esta).

**Criterio de listo:** el PDF de un presupuesto de prueba se genera, se guarda y se
descarga desde la URL de Netlify; visualmente comparable al actual.

**✅ Checkpoint:** generá el PDF de un presupuesto de prueba (en la URL de Netlify, no
solo local) y ponelo lado a lado con un PDF del sistema viejo: membrete, orden de
columnas, totales, condiciones. Diferencias menores de fuente/espaciado son aceptables;
faltantes de información, no. Aprobá y seguí.

---

## 🛑 FASE 8 — Cuenta corriente (confirmaciones, pagos, anulaciones, ajustes)

> **ALTO OBLIGATORIO. Esta fase toca dinero. Todo se prueba con clientes y presupuestos
> FICTICIOS (idealmente en el emulador, después en producción con datos de prueba). No
> registrar operaciones reales hasta aprobar el checkpoint completo. El agente NO avanza
> a la Fase 9 sin aprobación explícita de Pablo.**

**Objetivo:** el módulo contable completo según R8, con integridad transaccional.

**Tareas:**
1. `lib/acciones/cuentaCorriente.ts` — cada operación es UNA transacción de Firestore
   (`runTransaction` del admin SDK) que: valida según R8, toma el código MOV (R6), crea
   el movimiento, **actualiza `clientes.saldo`**, y cambia estados de presupuestos si
   corresponde. Errores descriptivos:
   - `confirmarPresupuesto(presupuestoId)` — valida 'Emitido' + sin confirmación activa
     (consulta en la transacción); debe = total; 'Confirmado' + supersede las otras
     versiones 'Emitido' de la misma obra.
   - `registrarPago(clienteId, monto, medioPago, referencia, presupuestoId?,
     permitirSaldoAFavor)` — si excede saldo deudor y el flag es false → error
     `SALDO_A_FAVOR`; la UI pide confirmación y reintenta con true.
   - `anularConfirmacion(presupuestoId, motivo)` / `anularPago(movId, motivo)` /
     `registrarAjuste(clienteId, debe, haber, motivo)` — motivo obligatorio, reversos
     vinculados por `movAnuladoId`, sin dobles anulaciones.
2. `lib/pdf/ReciboPDF.tsx`: recibo tipo cheque con `montoEnLetras` (Fase 2), mismo
   membrete. Se genera al registrar un pago, se sube a `recibos/`, se guarda
   `reciboPath` en el movimiento.
3. `scripts/reconciliar.ts`: recalcula el saldo de cada cliente sumando sus movimientos
   y lo compara contra el campo `saldo` denormalizado; reporta diferencias.
4. `/cuenta-corriente`: listado global de clientes con saldo ≠ 0 (query sobre el campo).
5. Cuenta corriente por cliente (completa la pestaña de la ficha): saldo actual,
   historial ordenado por fecha con saldo acumulado línea a línea, y acciones:
   Confirmar presupuesto (selector de sus presupuestos 'Emitido') · Registrar pago ·
   Anular confirmación · Anular pago · Ajuste manual. Anulaciones y ajustes con campo
   motivo obligatorio en el modal.
6. En el detalle del presupuesto: botón "Confirmar" (si 'Emitido') y "Anular" (si
   'Confirmado').

**Qué NO hacer:** NO importar movimientos reales (Fase 9). NO editar/borrar movimientos
— solo reversos. NO escrituras de saldo fuera de las transacciones de movimientos.

**Criterio de listo:** checklist del checkpoint completa en verde con datos ficticios,
y `reconciliar.ts` sin diferencias después de todas las pruebas.

**🛑 Checkpoint OBLIGATORIO (con datos de prueba, todos los casos):**
1. Confirmá un presupuesto → aparece el debe, estado 'Confirmado', y la otra versión
   'Emitido' de la misma obra pasó a 'Superado'.
2. Intentá confirmarlo de nuevo → rechazado con mensaje claro.
3. Registrá un pago parcial → saldo correcto; el recibo PDF se descarga y el monto en
   letras es correcto.
4. Registrá un pago MAYOR al saldo → debe pedir confirmación explícita; aceptá y
   verificá el saldo a favor (negativo).
5. Anulá el pago SIN motivo → rechazado. Con motivo → saldo restaurado, movimiento
   inverso vinculado. Intentá anular el mismo pago otra vez → rechazado.
6. Anulá la confirmación con motivo → presupuesto 'Anulado', saldo revertido.
7. Hacé un ajuste manual con motivo → impacta el saldo.
8. Verificá el saldo final del cliente a mano (suma de la columna debe − haber) contra
   lo que muestra la app, línea a línea, y corré `reconciliar.ts` → cero diferencias.
**Solo con los 8 puntos en verde, autorizás la Fase 9.**

---

## 🛑 FASE 9 — Importación de datos reales (clientes, históricos, movimientos)

> **ALTO OBLIGATORIO. Acá entran los datos reales de producción. Todo importador corre
> primero en `--dry-run` con reporte, se revisa, y recién después se ejecuta con
> `--ejecutar --produccion`. Orden estricto: clientes → presupuestos legado →
> movimientos (las referencias lo exigen).**

**Objetivo:** migrar la data real de los Sheets: hoja Clientes, hoja `_historial`
(presupuestos legado solo-lectura) y hoja Movimientos.

**Contexto necesario de Pablo:** export CSV de las 3 hojas.

**Tareas:** tres scripts en `scripts/import/`, todos con `--dry-run` default + reporte
CSV, y `--ejecutar --produccion`:
1. `import-clientes.ts` — mapea `cliente_id, nombre, telefono, email, direccion,
   localidad, tipo, cuit_dni, condicion_iva, origen, notas, fecha_alta, estado`.
   **Preserva los códigos CLI existentes como doc IDs** y deja `contadores/clientes`
   después del máximo. Importa con `saldo = 0` (los movimientos lo reconstruyen).
   Reporta teléfonos duplicados o inválidos para resolución manual ANTES de ejecutar
   (no inventa resoluciones).
2. `import-historial.ts` — cada fila de `_historial` (`fecha_hora, codigo_obra,
   cliente_nombre, total, version, link_pdf, cliente_id, estado`) → `obras/{codigo}`
   (una por código, preservando numeración; `contadores/obras-{anio}` queda después del
   máximo; `ultimaVersion` = versión máxima importada) + `presupuestos` con
   `esLegado = true`, `linkPdfLegado`, total y estado tal cual, `items = []`. Filas con
   cliente no resuelto van al reporte, no se descartan en silencio.
3. `import-movimientos.ts` — mapea todas las columnas de la hoja Movimientos,
   **preservando los códigos MOV y su cronología**. Vincula `presupuestoId` cuando
   codigo_obra+version matchea un legado importado; si no, deja el snapshot de texto.
   Reconstruye los vínculos `movAnuladoId`. Al final, **recalcula y escribe el `saldo`
   de cada cliente** desde sus movimientos importados.
4. Correr `scripts/reconciliar.ts` como paso final obligatorio.

**Qué NO hacer:** NO transformar ni "corregir" datos silenciosamente — toda anomalía va
al reporte y la resuelve Pablo. NO tocar los Sheets originales (solo lectura de CSVs).

**Criterio de listo:** los 3 imports ejecutados, `reconciliar.ts` sin diferencias (o con
diferencias explicadas y aceptadas por Pablo).

**🛑 Checkpoint OBLIGATORIO:**
1. Dry-run de los 3 en orden. Leé los reportes completos: duplicados, clientes no
   resueltos, movimientos huérfanos. Resolvé las anomalías y repetí el dry-run hasta
   reporte limpio.
2. (Recomendado) Ensayo general: corré los 3 imports contra el EMULADOR y revisá la app
   local antes de tocar producción.
3. Ejecutá real, en orden. Después:
   - Elegí 5 clientes que conozcas → datos completos y correctos en la app.
   - Elegí 3 presupuestos viejos → aparecen en el historial del cliente correcto, como
     legado, con el link al PDF andando, total y estado coincidiendo con el PDF.
   - Elegí 5 clientes CON movimientos → compará el saldo de la app contra el sistema
     viejo, peso por peso. Revisá el reporte de `reconciliar.ts`.
   - Verificá que el próximo código de obra y de cliente continúen la numeración (no
     que arranquen de 1).
**No pases a la Fase 10 con una sola diferencia de saldo sin explicar.**

---

## FASE 10 — Deploy final, respaldos y cierre

**Objetivo:** app en producción, usuarios reales creados, respaldos configurados.

**Tareas:**
1. Verificar env vars de producción en Netlify y deploy final.
2. Crear los usuarios reales (2–4) en Firebase Auth; login verificado por cada uno.
3. Respaldos: script `scripts/backup.ts` que exporta todas las colecciones a JSON local
   (con el service account) + documentar en el README correrlo periódicamente y antes de
   cambios grandes. (Opcional: backups programados de Firestore vía Google Cloud si se
   quiere automatizar.)
4. Revisión de seguridad: reglas de Firestore/Storage publicadas (escritura denegada al
   cliente web), service account fuera del repo (`.env*` en `.gitignore`), URLs firmadas
   con expiración corta.
5. README con: cómo correr local (emuladores), cómo deployar, cómo respaldar, y el mapa
   de fases.
6. (Opcional) dominio propio en Netlify.

**Criterio de listo:** smoke test en producción: login → crear cliente → crear
presupuesto → PDF → confirmar → pago con recibo → verificar saldo → anular con motivo →
`reconciliar.ts` limpio.

**✅ Checkpoint final:** hacé el smoke test completo vos mismo en la URL de producción
con un cliente de prueba (después anulá/ajustá para dejarlo en cero). Cuando todo
cierre, el sistema viejo queda congelado como solo-lectura y esta app pasa a ser la
fuente de verdad.

---

## Apéndice — Mapeo Sheets → colecciones (referencia para Fases 4 y 9)

| Sheet | Columnas | Destino |
|---|---|---|
| PRECIOS | codigo, rubro, nombre, unidad, precio_lista, precio_final_iva, estado, especificacion, moneda | `catalogo` (+ grupoContable, m2PorCaja, requiereVerificacion calculados) |
| Clientes | cliente_id, nombre, telefono, email, direccion, localidad, tipo, cuit_dni, condicion_iva, origen, notas, fecha_alta, estado | `clientes/{cliente_id}` (doc ID = código CLI) |
| _historial | fecha_hora, codigo_obra, cliente_nombre, total, version, link_pdf, cliente_id, estado | `obras/{codigo_obra}` + `presupuestos` (esLegado = true, items = []) |
| Movimientos | mov_id, fecha_hora, cliente_id, cliente_nombre, tipo, codigo_obra, version_presupuesto, concepto, debe, haber, medio_pago, referencia, mov_anulado_id, usuario, notas | `movimientos` (mov_id → codigo; usuario → notas o creadoPor si mapea) + recálculo de `clientes.saldo` |
