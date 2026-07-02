import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import { ReciboPDF } from "@/lib/pdf/ReciboPDF";
import type { ConfigGeneral, Movimiento } from "@/lib/tipos";

const VENCIMIENTO_URL_MS = 15 * 60 * 1000;

/** Ver comentario equivalente en app/api/pdf/presupuesto/[id]/route.ts. */
async function obtenerUrlDescarga(
  file: ReturnType<ReturnType<typeof adminStorage.bucket>["file"]>,
  path: string,
) {
  const useEmulator = process.env.NODE_ENV !== "production";

  if (useEmulator) {
    const token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199";
    return `http://${host}/v0/b/${adminStorage.bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + VENCIMIENTO_URL_MS,
  });
  return url;
}

/** Genera el recibo PDF de un pago, lo sube a Storage y devuelve una URL firmada de corta duración. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ movId: string }> },
) {
  const usuario = await obtenerUsuarioSesion();
  if (!usuario) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const { movId } = await params;

  const movimientoSnap = await adminDb.collection("movimientos").doc(movId).get();
  if (!movimientoSnap.exists) {
    return NextResponse.json({ ok: false, error: "Movimiento no encontrado" }, { status: 404 });
  }
  const movimiento = movimientoSnap.data() as Movimiento;

  if (movimiento.tipo !== "PAGO") {
    return NextResponse.json({ ok: false, error: "Solo los pagos generan recibo" }, { status: 400 });
  }

  const configSnap = await adminDb.collection("config").doc("general").get();
  const config = configSnap.exists ? (configSnap.data() as ConfigGeneral) : null;

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(ReciboPDF({ movimiento, config }));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "No se pudo generar el recibo" }, { status: 500 });
  }

  const reciboPath = `recibos/${movimiento.codigo}.pdf`;
  const file = adminStorage.bucket().file(reciboPath);

  try {
    await file.save(buffer, { contentType: "application/pdf" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "No se pudo guardar el recibo" }, { status: 500 });
  }

  await movimientoSnap.ref.update({ reciboPath });

  const url = await obtenerUrlDescarga(file, reciboPath);

  return NextResponse.json({ ok: true, url });
}
