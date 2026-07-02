# SaaS COTA CERO — Arquitectura y modelo de datos

Presupuestador de obras (pisos, decks, revestimientos) para COTA CERO. Migración desde
Google Apps Script + Sheets a una app full-stack donde el presupuesto es una entidad
persistente, editable y versionada, con gestión de clientes y cuenta corriente.

---

## 1. Decisiones confirmadas (2026-07-01)

| Tema | Decisión |
|---|---|
| Usuarios | 2–4 usuarios con login propio, todos con los mismos permisos. Roles diferenciados quedan para el futuro (el campo `rol` ya queda preparado). |
| Catálogo de precios | Se migra a la app (importación única desde el Sheet PRECIOS) y se mantiene desde una pantalla de administración. El Sheet queda como respaldo histórico. |
| Presupuestos históricos | Se importan como registros **solo-lectura** ("legado"): cabecera + total + estado + link al PDF original. Visibles en el historial del cliente, no editables ítem a ítem. |
| Precios al editar/duplicar | Editar conserva los precios tal cual se emitieron. Duplicar ofrece un botón opcional "Actualizar precios desde catálogo" que marca qué ítems cambiaron. |
| **Stack** | **Firebase (Firestore + Auth + Storage) + Netlify** — mismo ecosistema que la app de documentos de obra de COTA CERO, un solo proveedor que ya conocés y mantenés. |

## 2. Supuestos que tomé (avisame si alguno no va)

1. **Moneda de emisión: ARS únicamente.** Los ítems del catálogo en USD se convierten al
   emitir usando el `tcUsd` vigente, que queda **congelado en el presupuesto**
   (`tcUsdSnapshot`). Multi-moneda queda explícitamente fuera de alcance v1.
2. **Regla USD heredada se preserva tal cual**: solo se convierte si `moneda = Dolar` y
   `precioFinalIva < 5000`, y se marca `requiereVerificacion = true`. La pantalla de
   catálogo va a listar todos los ítems flaggeados para que los revises una vez migrado.
3. **PDFs con `@react-pdf/renderer`** (plantilla declarativa en React, corre en las
   funciones serverless de Netlify sin navegador headless). Guardados en **Firebase
   Storage** (carpetas `presupuestos/` y `recibos/`, privadas, servidas con URLs
   firmadas). Los PDFs legados conservan su link a Drive.
4. **Plan Blaze de Firebase** (pay-as-you-go): los proyectos nuevos de Firebase lo
   requieren para usar Storage. A esta escala el costo real es ~cero; se configura una
   alerta de presupuesto en la Fase 0 para dormir tranquilo.
5. **Sin signup público**: los 2–4 usuarios se crean a mano desde la consola de Firebase.

## 3. Stack y arquitectura

```
Navegador
   │
   ▼
Next.js (App Router, TypeScript, Tailwind)  ──── hosting: Netlify
   │  Server Components / Server Actions          (deploy automático desde GitHub)
   │  (firebase-admin SDK — todas las ESCRITURAS pasan por acá)
   │
   ├──► Firestore         ← toda la data (reglas: solo lectura autenticada;
   │                         escritura únicamente desde el servidor)
   ├──► Firebase Auth     ← login email/password (cookie de sesión en el server)
   └──► Firebase Storage  ← PDFs de presupuestos y recibos (privado, URLs firmadas)
```

**Por qué así:**
- **Sin backend separado.** Next.js hace de frontend y backend (server actions + route
  handlers, que Netlify convierte en funciones serverless). Una sola cosa que deployar.
- **Todas las escrituras pasan por el servidor** con `firebase-admin`. El navegador solo
  lee. Esto permite que las reglas de Firestore sean simples y muy seguras
  (`write: false` para clientes web), y que las validaciones vivan en un solo lugar.
- **Las operaciones de dinero usan transacciones de Firestore** (`runTransaction` del
  admin SDK): confirmar un presupuesto implica varias escrituras que deben ser atómicas
  (insertar movimiento + actualizar saldo del cliente + cambiar estados de versiones).
  O pasa todo, o no pasa nada.
- **Firestore no tiene constraints únicos ni secuencias** (a diferencia de Postgres), así
  que el diseño lo resuelve explícitamente: numeración con **contadores transaccionales**
  (`contadores/`), y anti-duplicados de teléfono con **consulta dentro de la transacción**
  de alta (el admin SDK lo permite).
- **El saldo de cada cliente se guarda denormalizado** en el doc del cliente y se
  actualiza en la misma transacción que cada movimiento (patrón estándar en Firestore,
  porque no hay `SUM ... GROUP BY`). Un script de reconciliación lo recalcula desde los
  movimientos para verificar que nunca se desvíe.
- **Reglas de negocio puras en TypeScript** (`lib/reglas/`): clasificación contable,
  normalización, m²/caja, totales por modalidad, monto en letras. Funciones puras con
  tests unitarios — la parte más importante de no romper.
- **Desarrollo local contra el Firebase Emulator Suite** (Firestore + Auth + Storage):
  podés romper todo localmente sin tocar producción; `npm run dev` levanta emuladores y
  app juntos.

## 4. Modelo de datos (colecciones de Firestore)

Los ítems del presupuesto van **embebidos en el documento del presupuesto** (array
`items`) — se guardan y leen siempre juntos, atómicamente. Un presupuesto grande está
lejísimos del límite de 1 MB por documento.

```
usuarios/{uid}                 ← espejo de Firebase Auth
clientes/{CLI-0001}            ← doc ID = código de cliente
catalogo/{autoId}
obras/{COTA-2026-0001}         ← doc ID = código de obra
presupuestos/{autoId}          ← con items[] embebidos
movimientos/{autoId}
contadores/{nombre}            ← numeración atómica
config/general
```

### `usuarios/{uid}`
| Campo | Tipo | Notas |
|---|---|---|
| nombre, email | string | |
| rol | string = 'usuario' | preparado para roles futuros; hoy no se usa |
| activo | boolean | |

### `clientes/{codigo}` — doc ID = `CLI-0001`
| Campo | Tipo | Notas |
|---|---|---|
| nombre | string | requerido |
| telefono | string | requerido, 8–13 dígitos |
| telefonoNormalizado | string | solo dígitos; **anti-duplicados por consulta dentro de la transacción de alta** |
| email, direccion, localidad, tipo, cuitDni, condicionIva, origen, notas | string | |
| estado | 'Activo' \| 'Inactivo' | no hay borrado físico |
| **saldo** | number | **denormalizado**: sum(debe) − sum(haber); solo lo actualizan las transacciones de movimientos |
| fechaAlta, creadoEn, actualizadoEn | timestamp | |

### `catalogo/{autoId}` — reemplaza la hoja PRECIOS
| Campo | Tipo | Notas |
|---|---|---|
| codigo | string | unicidad verificada por consulta en la transacción de alta |
| rubro, nombre, unidad, especificacion | string | |
| precioLista, precioFinalIva | number | |
| moneda | 'Pesos' \| 'Dolar' | |
| estado | string = 'Habilitado' | |
| grupoContable | 'materiales' \| 'mano_obra' \| 'accesorios' | calculado por la regla de clasificación al guardar |
| m2PorCaja | number \| null | extraído por regex de nombre/especificación al guardar |
| requiereVerificacion | boolean | flag USD chico heredado |
| creadoEn, actualizadoEn | timestamp | |

### `obras/{codigo}` — doc ID = `COTA-2026-0001`; agrupa las versiones
| Campo | Tipo | Notas |
|---|---|---|
| anio, numero | number | numeración anual vía `contadores/obras-{anio}` |
| clienteId | string | ref a clientes; si el cliente cambia, es obra nueva (regla de versionado) |
| clienteNombre | string | snapshot |
| ultimaVersion | number | contador de versiones, incrementado transaccionalmente |

### `presupuestos/{autoId}` — la entidad central
| Campo | Tipo | Notas |
|---|---|---|
| obraCodigo | string | ref a obras |
| version | number | única por obra, garantizada por la transacción que incrementa `obras.ultimaVersion` |
| clienteId, clienteNombre, telefono | string | FK + snapshots |
| direccionObra, tipoObra, vendedor | string | |
| fechaVisita, fechaEmision | timestamp | |
| m2Relevados | number | |
| subpiso, nivelSubpiso, observacionesRiesgos | string | |
| modalidad | 'integrada' \| 'colocacion' \| 'materiales' | |
| formaPago, validez, moneda, exclusiones | string | condiciones |
| estado | 'Emitido' \| 'Confirmado' \| 'Anulado' \| 'Superado' | |
| tcUsdSnapshot | number | TC usado al emitir, congelado |
| **items** | array embebido | ver abajo |
| subtotalMateriales, subtotalManoObra, subtotalAccesorios | number | subtotales de **todos** los ítems de cada grupo |
| total | number | suma de los subtotales de los grupos **incluidos por la modalidad** |
| esLegado | boolean | importado del sistema viejo, solo-lectura |
| linkPdfLegado | string | link a Drive del PDF original (solo legados) |
| pdfPath | string | path en Storage del PDF generado por la app |
| creadoPor | string (uid) | |
| creadoEn, actualizadoEn | timestamp | |

**Cada elemento de `items[]`:**
`{ catalogoId (null si manual), codigo, nombre, rubro, unidad, cantidad, precioUnitario,
subtotal, grupoContable, esManual, grupoContableExplicito, requiereVerificacion, orden }`

**Clave:** se guardan **todos** los ítems cargados, incluidos los que la modalidad excluye
del total. La inclusión es derivada (`modalidad` + `grupoContable`), nunca se borra data.

### `movimientos/{autoId}` — cuenta corriente (migra tal cual de la hoja Movimientos)
| Campo | Tipo | Notas |
|---|---|---|
| codigo | string | `MOV-000001`, vía `contadores/movimientos` |
| fechaHora | timestamp | |
| clienteId, clienteNombre | string | ref + snapshot |
| tipo | 'CONFIRMACION_PRESUPUESTO' \| 'PAGO' \| 'ANULACION_PRESUPUESTO' \| 'ANULACION_PAGO' \| 'AJUSTE' | |
| presupuestoId | string \| null | ref fuerte cuando existe |
| codigoObra, versionPresupuesto | string / number | snapshot (necesario para movimientos legados) |
| concepto | string | |
| debe, haber | number ≥ 0 | |
| medioPago, referencia, notas | string | |
| motivo | string | **obligatorio si tipo es anulación o ajuste** (validado en el server) |
| movAnuladoId | string \| null | qué movimiento revierte |
| reciboPath | string | path del recibo PDF en Storage (solo PAGO) |
| creadoPor | string (uid) | |

Los movimientos **nunca se editan ni borran**: solo se agregan reversos. Cada escritura
de movimiento actualiza `clientes.saldo` en la misma transacción.

### Colecciones auxiliares
- **`contadores/{nombre}`** (`{ ultimo: number }`): `clientes`, `movimientos`,
  `obras-2026`, `obras-2027`… Incremento con `runTransaction` — la numeración anual de
  obras reinicia sola porque cada año tiene su doc.
- **`config/general`**: `tcUsd`, `validezDefault`, datos de membrete.

### Consultas clave (reemplazan las vistas SQL)
- **Saldos globales ≠ 0**: `clientes where saldo != 0` (query directa sobre el campo
  denormalizado).
- **Historial con saldo acumulado**: movimientos del cliente ordenados por `fechaHora`;
  el acumulado se calcula en el cliente (pocos docs por cliente, costo trivial).
- **Índices compuestos** en `firestore.indexes.json` versionado en el repo (movimientos
  por clienteId+fechaHora, presupuestos por clienteId+creadoEn, etc.).

## 5. Operaciones de dinero (server actions con `runTransaction`) — Fase 8

Todas en `lib/acciones/cuentaCorriente.ts`, corriendo con el admin SDK. Cada una es UNA
transacción de Firestore con validaciones y errores descriptivos:

| Acción | Qué hace y qué valida |
|---|---|
| `confirmarPresupuesto(presupuestoId)` | Valida estado = 'Emitido' y que no exista confirmación activa para esa obra+versión. Inserta movimiento `debe = total`, suma al saldo del cliente, pasa el presupuesto a 'Confirmado' y **todas las otras versiones 'Emitido' de la misma obra a 'Superado'**. |
| `registrarPago(clienteId, monto, medioPago, referencia, presupuestoId?, permitirSaldoAFavor)` | Si el pago supera el saldo deudor y `permitirSaldoAFavor = false` → error controlado; la UI pide confirmación explícita y reintenta con `true`. Inserta `haber = monto` y descuenta el saldo. El recibo PDF se genera después y se guarda su path. |
| `anularConfirmacion(presupuestoId, motivo)` | Motivo obligatorio. Encuentra la confirmación activa, inserta el movimiento inverso (`haber`), vincula `movAnuladoId`, ajusta saldo, presupuesto → 'Anulado'. |
| `anularPago(movId, motivo)` | Motivo obligatorio. Inserta el inverso (`debe`) vinculado al pago original. Rechaza anular dos veces el mismo pago. |
| `registrarAjuste(clienteId, debe, haber, motivo)` | Motivo obligatorio. Ajuste manual libre, actualiza saldo. |

Además: `scripts/reconciliar.ts` recalcula el saldo de cada cliente desde sus movimientos
y lo compara con el campo denormalizado — se corre después de la importación y cuando
quieras verificar integridad.

## 6. Reglas de negocio compartidas (`lib/reglas/`, TypeScript puro + tests)

Detalladas en el plan de implementación (Fase 2). Resumen:
- `normalizar(texto)` — minúsculas, sin acentos.
- `clasificarGrupoContable(rubro)` — **el orden de evaluación importa**: flete → mano de
  obra → accesorios → materiales (ej.: "lijado" debe caer en mano_obra aunque contiene
  "lija", que es keyword de accesorios).
- `extraerM2PorCaja(nombre, especificacion)` — regex sobre paréntesis: "(2,16 m2)",
  "(3.16 x caja)".
- `calcularTotales(items, modalidad)` — subtotales por grupo + total según modalidad.
- `montoEnLetras(numero)` — para el recibo tipo cheque.
- `telefonoValido(t)` — 8–13 dígitos.

## 7. Seguridad

- **Reglas de Firestore**: lectura solo para usuarios autenticados; **escritura
  denegada para todos los clientes web** (`allow write: if false`) — toda escritura pasa
  por server actions con el admin SDK, que valida antes de escribir.
- **Reglas de Storage**: sin acceso directo; los PDFs se sirven con **URLs firmadas** de
  corta duración generadas en el servidor.
- **Auth**: email/password con cookie de sesión verificada en el server (middleware).
  Sin signup público.
- La clave del **service account** (`FIREBASE_SERVICE_ACCOUNT`) vive solo en las env vars
  de Netlify y en `.env.local` (gitignoreado) — nunca en el repo ni en el navegador.

## 8. Fuera de alcance v1 (decidido, no olvidado)

- Roles y permisos diferenciados (campo preparado, lógica no).
- Multi-moneda en la emisión.
- Sincronización con Google Sheets (la migración es one-way, una vez).
- Modo offline.
- Facturación/AFIP.

---
*Documento generado el 2026-07-01 (rev. Firebase + Netlify). Ver
[PLAN-IMPLEMENTACION.md](PLAN-IMPLEMENTACION.md) para la ejecución por fases.*
