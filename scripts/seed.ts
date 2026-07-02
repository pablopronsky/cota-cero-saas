/**
 * Puebla el emulador de Firestore con datos FICTICIOS para desarrollo.
 * Corre siempre contra el emulador (nunca contra producción): requiere
 * FIRESTORE_EMULATOR_HOST seteado antes de inicializar el admin SDK.
 *
 * Uso: npm run seed   (con los emuladores ya corriendo)
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

if (!process.env.FIRESTORE_EMULATOR_HOST.match(/^(127\.0\.0\.1|localhost)/)) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST no apunta a localhost — abortando para no tocar producción."
  );
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ projectId: "cota-cero-saas-35cc0" });
// cert() no hace falta contra el emulador; se ignora si no hay credenciales.
void cert;

const db = getFirestore(app);

const ahora = Timestamp.now();

async function seed() {
  const batch = db.batch();

  // --- Clientes ---
  const clientes = [
    {
      id: "CLI-0001",
      nombre: "Juan Pérez",
      telefono: "2211234567",
      telefonoNormalizado: "2211234567",
      email: "juan.perez@example.com",
      direccion: "Calle 50 N° 1234",
      localidad: "La Plata",
      tipo: "Particular",
      cuitDni: "20123456789",
      condicionIva: "Consumidor Final",
      origen: "Referido",
      notas: "",
      estado: "Activo" as const,
      saldo: 0,
    },
    {
      id: "CLI-0002",
      nombre: "María Gómez",
      telefono: "2215557890",
      telefonoNormalizado: "2215557890",
      email: "maria.gomez@example.com",
      direccion: "Av. 7 N° 850",
      localidad: "La Plata",
      tipo: "Particular",
      cuitDni: "27234567890",
      condicionIva: "Consumidor Final",
      origen: "Instagram",
      notas: "",
      estado: "Activo" as const,
      saldo: 15000,
    },
    {
      id: "CLI-0003",
      nombre: "Constructora Del Sur SA",
      telefono: "2214449876",
      telefonoNormalizado: "2214449876",
      email: "compras@delsursa.com.ar",
      direccion: "Camino Centenario km 5",
      localidad: "Gonnet",
      tipo: "Empresa",
      cuitDni: "30712345678",
      condicionIva: "Responsable Inscripto",
      origen: "Web",
      notas: "Cliente frecuente, obras grandes",
      estado: "Activo" as const,
      saldo: 0,
    },
  ];

  for (const c of clientes) {
    const { id, ...data } = c;
    batch.set(db.collection("clientes").doc(id), {
      ...data,
      fechaAlta: ahora,
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
  }

  // --- Catálogo: cubre materiales, mano_obra, accesorios y un caso USD < 5000 ---
  const catalogo = [
    {
      codigo: "PIS-ROB-001",
      rubro: "Pisos de madera",
      nombre: "Piso Roble Natural 3 tiras",
      unidad: "m2",
      especificacion: "Caja x 8 tablas (2,16 m2)",
      precioLista: 45000,
      precioFinalIva: 54450,
      moneda: "Pesos" as const,
      estado: "Habilitado" as const,
      grupoContable: "materiales" as const,
      m2PorCaja: 2.16,
      requiereVerificacion: false,
    },
    {
      codigo: "PIS-EUC-002",
      rubro: "Pisos de madera",
      nombre: "Piso Eucalipto Grand Nature",
      unidad: "m2",
      especificacion: "Caja (3,16 x caja)",
      precioLista: 38000,
      precioFinalIva: 45980,
      moneda: "Pesos" as const,
      estado: "Habilitado" as const,
      grupoContable: "materiales" as const,
      m2PorCaja: 3.16,
      requiereVerificacion: false,
    },
    {
      codigo: "DEC-IPE-003",
      rubro: "Decks",
      nombre: "Deck Ipe 1a calidad",
      unidad: "m2",
      especificacion: "",
      precioLista: 62000,
      precioFinalIva: 75020,
      moneda: "Dolar" as const,
      estado: "Habilitado" as const,
      grupoContable: "materiales" as const,
      m2PorCaja: null,
      requiereVerificacion: false,
    },
    {
      codigo: "SRV-COL-004",
      rubro: "Servicio de colocación",
      nombre: "Colocación piso flotante",
      unidad: "m2",
      especificacion: "",
      precioLista: 8000,
      precioFinalIva: 8000,
      moneda: "Pesos" as const,
      estado: "Habilitado" as const,
      grupoContable: "mano_obra" as const,
      m2PorCaja: null,
      requiereVerificacion: false,
    },
    {
      codigo: "SRV-LIJ-005",
      rubro: "Lijado",
      nombre: "Lijado y plastificado de piso existente",
      unidad: "m2",
      especificacion: "",
      precioLista: 9500,
      precioFinalIva: 9500,
      moneda: "Pesos" as const,
      estado: "Habilitado" as const,
      grupoContable: "mano_obra" as const,
      m2PorCaja: null,
      requiereVerificacion: false,
    },
    {
      codigo: "SRV-RES-006",
      rubro: "Restauración",
      nombre: "Restauración de deck existente",
      unidad: "m2",
      especificacion: "",
      precioLista: 12000,
      precioFinalIva: 12000,
      moneda: "Pesos" as const,
      estado: "Habilitado" as const,
      grupoContable: "mano_obra" as const,
      m2PorCaja: null,
      requiereVerificacion: false,
    },
    {
      codigo: "ACC-ADH-007",
      rubro: "Adhesivos",
      nombre: "Adhesivo para piso flotante",
      unidad: "kg",
      especificacion: "",
      precioLista: 3500,
      precioFinalIva: 3500,
      moneda: "Pesos" as const,
      estado: "Habilitado" as const,
      grupoContable: "accesorios" as const,
      m2PorCaja: null,
      requiereVerificacion: false,
    },
    {
      codigo: "ACC-ZOC-008",
      rubro: "Zócalos",
      nombre: "Zócalo MDF 7cm",
      unidad: "ml",
      especificacion: "",
      precioLista: 2100,
      precioFinalIva: 2100,
      moneda: "Pesos" as const,
      estado: "Habilitado" as const,
      grupoContable: "accesorios" as const,
      m2PorCaja: null,
      requiereVerificacion: false,
    },
    {
      codigo: "ACC-FLE-009",
      rubro: "Flete",
      nombre: "Flete de materiales",
      unidad: "unidad",
      especificacion: "",
      precioLista: 15000,
      precioFinalIva: 15000,
      moneda: "Pesos" as const,
      estado: "Habilitado" as const,
      grupoContable: "accesorios" as const,
      m2PorCaja: null,
      requiereVerificacion: false,
    },
    {
      codigo: "ACC-HID-010",
      rubro: "Terminaciones",
      nombre: "Hidrolaca Poliuretánica 4L",
      unidad: "unidad",
      especificacion: "",
      precioLista: 30,
      precioFinalIva: 32,
      moneda: "Dolar" as const,
      estado: "Habilitado" as const,
      grupoContable: "accesorios" as const,
      m2PorCaja: null,
      // < 5000 en USD -> regla heredada la marca para verificar
      requiereVerificacion: true,
    },
  ];

  const catalogoIds: string[] = [];
  for (const item of catalogo) {
    const ref = db.collection("catalogo").doc();
    catalogoIds.push(ref.id);
    batch.set(ref, { ...item, creadoEn: ahora, actualizadoEn: ahora });
  }

  // --- Config general ---
  batch.set(db.collection("config").doc("general"), {
    tcUsd: 1200,
    validezDefault: "15 días",
    membrete: {
      nombre: "COTA CERO",
      direccion: "La Plata, Buenos Aires",
      telefono: "221-000-0000",
      logoUrl: "",
    },
  });

  // --- Movimiento que respalda el saldo≠0 de CLI-0002 (si no, reconciliar.ts
  // siempre marcaría una diferencia falsa: el saldo denormalizado es sum(debe)-sum(haber)). ---
  batch.set(db.collection("movimientos").doc(), {
    codigo: "MOV-000001",
    fechaHora: ahora,
    clienteId: "CLI-0002",
    clienteNombre: "María Gómez",
    tipo: "AJUSTE" as const,
    presupuestoId: null,
    codigoObra: "",
    versionPresupuesto: 0,
    concepto: "Ajuste manual",
    debe: 15000,
    haber: 0,
    medioPago: "",
    referencia: "",
    motivo: "Saldo inicial de prueba (seed)",
    movAnuladoId: null,
    reciboPath: "",
    notas: "",
    creadoPor: "seed-script",
  });

  // --- Contadores consistentes con lo sembrado ---
  batch.set(db.collection("contadores").doc("clientes"), { ultimo: 3 });
  batch.set(db.collection("contadores").doc("movimientos"), { ultimo: 1 });
  batch.set(db.collection("contadores").doc("obras-2026"), { ultimo: 1 });

  // --- Obra con 2 versiones de presupuesto (misma obra, cliente CLI-0001) ---
  const obraCodigo = "COTA-2026-0001";
  batch.set(db.collection("obras").doc(obraCodigo), {
    anio: 2026,
    numero: 1,
    clienteId: "CLI-0001",
    clienteNombre: "Juan Pérez",
    ultimaVersion: 2,
  });

  const itemsV1 = [
    {
      catalogoId: catalogoIds[0],
      codigo: "PIS-ROB-001",
      nombre: "Piso Roble Natural 3 tiras",
      rubro: "Pisos de madera",
      unidad: "m2",
      cantidad: 40,
      precioUnitario: 54450,
      subtotal: 2178000,
      grupoContable: "materiales" as const,
      esManual: false,
      grupoContableExplicito: false,
      requiereVerificacion: false,
      orden: 1,
    },
    {
      catalogoId: catalogoIds[3],
      codigo: "SRV-COL-004",
      nombre: "Colocación piso flotante",
      rubro: "Servicio de colocación",
      unidad: "m2",
      cantidad: 40,
      precioUnitario: 8000,
      subtotal: 320000,
      grupoContable: "mano_obra" as const,
      esManual: false,
      grupoContableExplicito: false,
      requiereVerificacion: false,
      orden: 2,
    },
    {
      catalogoId: catalogoIds[6],
      codigo: "ACC-ADH-007",
      nombre: "Adhesivo para piso flotante",
      rubro: "Adhesivos",
      unidad: "kg",
      cantidad: 20,
      precioUnitario: 3500,
      subtotal: 70000,
      grupoContable: "accesorios" as const,
      esManual: false,
      grupoContableExplicito: false,
      requiereVerificacion: false,
      orden: 3,
    },
  ];
  const subtotalMaterialesV1 = 2178000;
  const subtotalManoObraV1 = 320000;
  const subtotalAccesoriosV1 = 70000;

  batch.set(db.collection("presupuestos").doc(), {
    obraCodigo,
    version: 1,
    clienteId: "CLI-0001",
    clienteNombre: "Juan Pérez",
    telefono: "2211234567",
    direccionObra: "Calle 50 N° 1234",
    tipoObra: "Vivienda",
    vendedor: "Pablo",
    fechaVisita: ahora,
    fechaEmision: ahora,
    m2Relevados: 40,
    subpiso: "Contrapiso",
    nivelSubpiso: "Nivelado",
    observacionesRiesgos: "",
    modalidad: "integrada" as const,
    formaPago: "50% anticipo, saldo contra entrega",
    validez: "15 días",
    moneda: "ARS",
    exclusiones: "",
    estado: "Superado" as const,
    tcUsdSnapshot: 1200,
    items: itemsV1,
    subtotalMateriales: subtotalMaterialesV1,
    subtotalManoObra: subtotalManoObraV1,
    subtotalAccesorios: subtotalAccesoriosV1,
    total: subtotalMaterialesV1 + subtotalManoObraV1 + subtotalAccesoriosV1,
    esLegado: false,
    linkPdfLegado: "",
    pdfPath: "",
    creadoPor: "seed-script",
    creadoEn: ahora,
    actualizadoEn: ahora,
  });

  const itemsV2 = itemsV1.map((it) => ({ ...it }));
  itemsV2[0] = { ...itemsV2[0], cantidad: 45, subtotal: 54450 * 45 };
  itemsV2[1] = { ...itemsV2[1], cantidad: 45, subtotal: 8000 * 45 };
  const subtotalMaterialesV2 = itemsV2[0].subtotal;
  const subtotalManoObraV2 = itemsV2[1].subtotal;
  const subtotalAccesoriosV2 = itemsV2[2].subtotal;

  batch.set(db.collection("presupuestos").doc(), {
    obraCodigo,
    version: 2,
    clienteId: "CLI-0001",
    clienteNombre: "Juan Pérez",
    telefono: "2211234567",
    direccionObra: "Calle 50 N° 1234",
    tipoObra: "Vivienda",
    vendedor: "Pablo",
    fechaVisita: ahora,
    fechaEmision: ahora,
    m2Relevados: 45,
    subpiso: "Contrapiso",
    nivelSubpiso: "Nivelado",
    observacionesRiesgos: "Cliente amplió metraje tras relevar",
    modalidad: "integrada" as const,
    formaPago: "50% anticipo, saldo contra entrega",
    validez: "15 días",
    moneda: "ARS",
    exclusiones: "",
    estado: "Emitido" as const,
    tcUsdSnapshot: 1200,
    items: itemsV2,
    subtotalMateriales: subtotalMaterialesV2,
    subtotalManoObra: subtotalManoObraV2,
    subtotalAccesorios: subtotalAccesoriosV2,
    total: subtotalMaterialesV2 + subtotalManoObraV2 + subtotalAccesoriosV2,
    esLegado: false,
    linkPdfLegado: "",
    pdfPath: "",
    creadoPor: "seed-script",
    creadoEn: ahora,
    actualizadoEn: ahora,
  });

  await batch.commit();

  console.log("Seed completo:");
  console.log(`  ${clientes.length} clientes`);
  console.log(`  ${catalogo.length} ítems de catálogo`);
  console.log(`  1 obra (${obraCodigo}) con 2 versiones de presupuesto`);
  console.log("  config/general y contadores/ creados");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error corriendo el seed:", err);
    process.exit(1);
  });
