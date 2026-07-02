import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import { PresupuestoPDF } from "@/lib/pdf/PresupuestoPDF";
import type { ConfigGeneral, Presupuesto } from "@/lib/tipos";

const VENCIMIENTO_URL_MS = 15 * 60 * 1000;

/**
 * El Storage emulator no puede firmar URLs (getSignedUrl necesita
 * credenciales reales de service account, ver lib/firebase/admin.ts). En
 * dev se usa el esquema de download token del emulador; en producción, la
 * URL firmada real de corta duración.
 */
async function obtenerUrlDescarga(file: ReturnType<ReturnType<typeof adminStorage.bucket>["file"]>, path: string) {
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

/**
 * Genera (o regenera) el PDF del presupuesto, lo sube a Storage y devuelve
 * una URL firmada de corta duración. Se regenera siempre en cada llamada
 * para no depender de un marcador de "desactualizado" aparte del doc.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const usuario = await obtenerUsuarioSesion();
  if (!usuario) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const presupuestoSnap = await adminDb.collection("presupuestos").doc(id).get();
  if (!presupuestoSnap.exists) {
    return NextResponse.json({ ok: false, error: "Presupuesto no encontrado" }, { status: 404 });
  }
  const presupuesto = presupuestoSnap.data() as Presupuesto;

  if (presupuesto.esLegado) {
    return NextResponse.json(
      { ok: false, error: "Los presupuestos legado no tienen PDF generado por la app" },
      { status: 400 },
    );
  }

  const configSnap = await adminDb.collection("config").doc("general").get();
  const config = configSnap.exists ? (configSnap.data() as ConfigGeneral) : null;

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(PresupuestoPDF({ presupuesto, config }));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "No se pudo generar el PDF" }, { status: 500 });
  }

  const pdfPath = `presupuestos/${presupuesto.obraCodigo}/v${presupuesto.version}.pdf`;
  const file = adminStorage.bucket().file(pdfPath);

  try {
    await file.save(buffer, { contentType: "application/pdf" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "No se pudo guardar el PDF" }, { status: 500 });
  }

  await presupuestoSnap.ref.update({ pdfPath });

  const url = await obtenerUrlDescarga(file, pdfPath);

  return NextResponse.json({ ok: true, url });
}
