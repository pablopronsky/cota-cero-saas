# SaaS COTA CERO — Presupuestador

App interna de presupuestos de obra para **COTA CERO** (pisos, decks, revestimientos —
La Plata). Reemplaza el sistema viejo en Google Apps Script + Sheets: el presupuesto es
una entidad persistente, editable y versionada, con catálogo de precios, clientes y
cuenta corriente.

- **Producción:** https://saas-cota-cero.netlify.app
- **Repo:** https://github.com/pablopronsky/cota-cero-saas
- **Proyecto Firebase:** `cota-cero-saas-35cc0` (plan Blaze)

Documentación de diseño: [ARQUITECTURA.md](ARQUITECTURA.md) ·
[PLAN-IMPLEMENTACION.md](PLAN-IMPLEMENTACION.md) (reglas de negocio R1–R9 y modelo de datos).

## Stack

Next.js (App Router) + TypeScript estricto + Tailwind · Firebase (Firestore + Auth +
Storage) · `firebase-admin` en el servidor (**todas las escrituras pasan por server
actions; el navegador solo lee**) · `@react-pdf/renderer` para PDFs · Vitest ·
hosting en Netlify.

## Correr en local

El desarrollo va **siempre contra el Firebase Emulator Suite** (Firestore + Auth +
Storage) — nunca contra producción.

### Requisitos

- Node.js 20+
- **Java en el PATH** (lo necesita el emulador de Firestore). En Git Bash, antes de
  levantar los emuladores:
  ```bash
  export PATH="/b/Java/bin:$PATH"
  ```
- `.env.local` con la config web de Firebase (`NEXT_PUBLIC_FIREBASE_*`) y el service
  account (`FIREBASE_SERVICE_ACCOUNT`, JSON en una línea). **Gitignoreado — nunca se
  commitea.**

### Pasos

```bash
npm install
npm run dev        # levanta emuladores + Next juntos (concurrently)
```

- App: http://localhost:3000 · UI de emuladores: http://localhost:4000
- `npm run dev` usa `--import=./.firebase-data --export-on-exit`, así que los datos del
  emulador persisten entre corridas.

### Seed de datos ficticios

Con los emuladores ya corriendo, en otra terminal:

```bash
npm run seed       # 3 clientes, 10 ítems de catálogo, 1 obra con 2 versiones, config, contadores
```

### Otros comandos

```bash
npm test               # tests unitarios de reglas de negocio (Vitest)
npm run test:integracion   # tests de cuenta corriente contra el emulador de Firestore
npm run build          # build de producción (incluye chequeo de TypeScript)
npm run lint           # ESLint
```

> Si `tsc --noEmit` reporta errores en `.next/dev/types/**`, son tipos viejos que dejó un
> dev server. Borrá `.next/` y volvé a correr; el chequeo autoritativo es `npm run build`.

## Deploy

Deploy **automático en Netlify** al pushear a `main`:

```bash
git push origin main   # → Netlify buildea y publica saas-cota-cero.netlify.app
```

- Las **env vars de producción** viven en Netlify (*Site configuration → Environment
  variables*): las 7 `NEXT_PUBLIC_FIREBASE_*` + `FIREBASE_SERVICE_ACCOUNT`. **No** debe
  existir ninguna `*_EMULATOR_HOST` en producción (haría que apunte al emulador).
- **Reglas de Firestore/Storage e índices** se deployan aparte (no van con el build de
  Netlify). Solo cuando cambien:
  ```bash
  npx firebase deploy --only firestore:rules,firestore:indexes,storage
  ```

## Respaldos

Exportá todo Firestore a JSON local con [`scripts/backup.ts`](scripts/backup.ts):

```bash
npm run backup                   # contra el emulador
npm run backup -- --produccion   # contra producción (solo lectura)
```

Genera `backups/<timestamp>-<entorno>/<coleccion>.json` (+ `_meta.json` con el resumen).
La carpeta `backups/` está gitignoreada (contiene datos reales). Los Timestamp se
serializan como `{ __type: "timestamp", seconds, nanoseconds }` para poder restaurarlos.

**Cuándo respaldar:**

- **Periódicamente** (semanal/mensual, según actividad).
- **Siempre antes de cambios grandes**: importaciones, migraciones, cambios de reglas o
  cualquier operación masiva sobre producción.

Para verificar integridad de saldos: `npm run reconciliar -- --produccion` (recalcula el
saldo de cada cliente desde sus movimientos y lo compara con el campo denormalizado).

## Mapa de fases (0–10)

- **Fase 0** — Setup: Next.js + Firebase (real + emuladores) + deploy base en Netlify.
- **Fase 1** — Modelo de datos (`lib/tipos.ts`), reglas de seguridad, numeración
  transaccional y seed de prueba.
- **Fase 2** — Reglas de negocio puras R1–R8 en `lib/reglas/` con tests (Vitest).
- **Fase 3** — Autenticación (cookie de sesión) + CRUD de clientes.
- **Fase 4** — Catálogo de precios + importador del Sheet PRECIOS.
- **Fase 5** — Presupuestos: formulario de creación.
- **Fase 6** — Presupuestos: listado, detalle, edición, duplicado y versionado.
- **Fase 7** — Generación del PDF del presupuesto (Storage + URL firmada).
- **Fase 8** — Cuenta corriente: confirmaciones, pagos, anulaciones y ajustes (dinero,
  transaccional).
- **Fase 9** — Importación de datos reales (clientes → historial legado → movimientos).
- **Fase 10** — Deploy final, usuarios reales, respaldos, revisión de seguridad y cierre.
