# F7-lite — Puente Presupuestador → Protocolo (Gestión de Obra)

**Estado:** spec consensuada, NO implementar todavía (ver "Cuándo implementar").
**Fecha:** 2026-07-10.
**Origen:** análisis de producto (TERRA GPT 5.6) + revisión contra código real (Claude Fable 5) + consenso final entre ambos y Pablo.

---

## Contexto

Existen dos apps separadas y sanas:

| | Presupuestador (esta app) | Protocolo (Gestión de Obra) |
|---|---|---|
| Repo | `pablopronsky/cota-cero-saas` | `pablopronsky/protocolo_cota_cero` |
| Path local | `B:\SaaS Cota Cero` | `B:\Cota Cero protocolo\cotacero` |
| Firebase | `cota-cero-saas-35cc0` | `cota-cero-protocolo` |
| Deploy | Netlify (`saas-cota-cero.netlify.app`) | Vercel (`protocolo-cota-cero.vercel.app`) |
| Gobierna | cliente, precio, versiones, cuenta corriente | ejecución técnica: VT→EP→OT→RF→AC→FM, fotos, firma |
| Clientes | `clientes`, IDs `CLI-NNNN` | `clients`, IDs autogenerados de Firestore |
| Roles | todos iguales | `admin` / `tecnico` |

**Decisión de fondo: NO se fusionan.** Proyectos Firebase, pools de Auth, repos y deploys
distintos. Un merge real (auth única, modelo unificado, un solo deploy) cuesta semanas y
no aporta valor a un equipo de 2–4 personas que ya usa ambas. El puente es liviano,
manual-primero y sin acoplamiento.

## Qué NO se hace (decidido, no reabrir sin motivo nuevo)

- ❌ Fusionar repos, auth, colecciones o navegación.
- ❌ Integración server-to-server: `/api/projects/create` del Protocolo exige
  `requireAdmin(req)` con token de Auth **del proyecto Firebase del Protocolo**
  (`src/app/api/projects/create/route.ts:12`). Llamarla desde el Presupuestador
  obligaría a cruzar service accounts y mintear tokens entre proyectos. No vale el costo.
- ❌ Colección `handoff` con estados (pendiente/creado/rechazado): burocracia para 4
  usuarios. Con los campos de vínculo bidireccional alcanza.
- ❌ Sincronización en tiempo real o deduplicación automática de clientes entre apps.

## ⚠️ Colisión de formatos de código (leer antes de tocar nada)

**Los códigos de proyecto del Protocolo y los códigos de obra del Presupuestador usan
el MISMO formato `COTA-AAAA-NNNN`** (verificado: `buildCode` en
`B:\Cota Cero protocolo\cotacero\src\lib\ids.ts:6`). Un código suelto NO identifica de
qué sistema salió; puede existir `COTA-2026-0018` en ambos y referirse a cosas distintas.

Reglas derivadas:

- Los campos de vínculo llevan SIEMPRE el prefijo del sistema en el nombre:
  `protocoloProyectoCodigo`, `protocoloProyectoUrl` (nunca `proyectoRef` a secas).
- La UI dice siempre **"proyecto del Protocolo COTA-2026-0018"**, nunca "proyecto
  COTA-2026-0018" a secas.
- El query param de retorno es `?protocoloProyecto=...`, no `?proyecto=...`.

## Formato de referencia uniforme

`presupuestoRef` (campo ya existente en el Protocolo, string libre): se fija el formato

```
COTA-AAAA-NNNN vN        ej.: COTA-2026-0042 v2
```

(código de obra + versión, como lo muestra el Presupuestador). Actualizar el placeholder
del form del Protocolo (`src/app/(app)/projects/new/page.tsx:385`, hoy dice
`COTA-2026-XXXX`) para que coincida.

---

## Spec por versiones

### v0 — Manual (disponible HOY, sin código)

Al crear un proyecto en el Protocolo, pegar a mano el `presupuestoRef` en el campo que
ya existe en el form. Opcionalmente, pegar la URL del proyecto en las notas de la obra
del Presupuestador.

**Esta v0 es la validación:** el botón (v1) se implementa recién cuando este paso manual
se haya usado varias veces y quede claro que reduce fricción real.

### v1 — Deep link con precarga (~1 día)

**En el Presupuestador:** en el detalle de un presupuesto **Confirmado**, botón:

```
[Crear proyecto de obra ↗]
```

Abre en pestaña nueva `/projects/new` del Protocolo con query params:

```
presupuestoRef = COTA-2026-0042 v2
clienteNombre, telefono
calle / numero / localidad / referencia
m2, modalidad
descripcionMaterial (sugerida, editable)
origen = <URL del detalle del presupuesto, para el retorno de v1.1>
```

**Sin email en query params salvo necesidad real** (las query strings quedan en
historial del navegador y logs de Vercel; mandar solo lo imprescindible).

**En el Protocolo:** el form de proyecto nuevo ya soporta precarga por query param
(`searchParams.get('clienteId')` en `projects/new/page.tsx:194`) y ya tiene los toggles
"Buscar cliente existente" / "+ Nuevo cliente". Extender la precarga a los params de
arriba: se abre el bloque **"Nuevo cliente" precargado** con nombre/teléfono, pero con
**"← Buscar existente" siempre visible** para no duplicar a alguien ya cargado. El
`clienteId` del Presupuestador NO viaja: pertenece a otra base; solo viaja snapshot.

El usuario revisa material principal y responsable técnico (decisiones humanas, no se
automatizan) y crea el proyecto **bajo su propia sesión y permisos** — por eso el deep
link no necesita cruzar auth: `requireAdmin` se respeta solo.

### v1.1 — Vínculo de vuelta (+~medio día)

Tras crear el proyecto, el Protocolo muestra:

```
[Volver al presupuesto]  →  {origen}?protocoloProyecto=COTA-2026-0018
```

**En el Presupuestador,** al recibir `?protocoloProyecto=`:

1. Validar formato: `^COTA-\d{4}-\d{4}$`.
2. **NUNCA persistir automáticamente.** Mostrar confirmación explícita:

```
Vincular proyecto del Protocolo COTA-2026-0018 a este presupuesto
[Confirmar]  [Descartar]
```

(Una URL vieja reenviada por WhatsApp o un copy-paste equivocado no debe linkear un
proyecto en silencio.)

3. Al confirmar, guardar en la obra (server action):
   - `protocoloProyectoCodigo: "COTA-2026-0018"`
   - `protocoloProyectoUrl: "https://protocolo-cota-cero.vercel.app/projects/..."`
   - fecha de vinculación

Alternativa manual equivalente (misma pantalla): acción "Vincular proyecto del
Protocolo" donde se pega el código a mano.

**Resultado — ambos lados muestran el enlace:**

```
Presupuestador:  Proyecto de obra del Protocolo COTA-2026-0018  [Abrir ↗]
Protocolo:       Presupuesto origen COTA-2026-0042 v2           [Abrir ↗]
```

### Badge de versión (incluido en v1.1)

Si una obra tiene `protocoloProyectoCodigo` y luego se confirma una versión del
presupuesto DISTINTA de la referenciada en el vínculo, el Presupuestador muestra un
aviso: *"El proyecto del Protocolo COTA-2026-0018 se creó sobre la v2; se confirmó la
v3"*. Solo aviso visual — sin sincronización.

---

## Cuándo implementar

Después de F2 (estado comercial), F5 (plan de cobro) y F1 (pantalla "Hoy"), y solo si
la v0 manual demostró usarse. Hasta entonces este documento es la única salida de F7.

## Esfuerzo estimado

| Pieza | Esfuerzo |
|---|---|
| v0 manual | 0 (ya existe) |
| v1 deep link + precarga | ~1 día bien probado |
| v1.1 retorno + confirmación + badge | ~medio día |
| API cruzada / handoff / sync | no hacer |
