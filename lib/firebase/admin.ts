import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Nota: Auth (getAuth) y Storage (getStorage) del admin SDK se agregan en sus
// fases correspondientes (Auth en Fase 3, Storage en Fase 7). El modulo
// firebase-admin/auth arrastra jwks-rsa -> jose (ESM-only), que rompe en las
// funciones serverless de Netlify; se resuelve cuando esas fases lo necesiten.

function buildAdminApp(): App {
  if (getApps().length) return getApps()[0];

  const useEmulator = process.env.NODE_ENV !== "production";

  if (useEmulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";

    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("Falta FIREBASE_SERVICE_ACCOUNT en las variables de entorno");
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const adminApp = buildAdminApp();

export const adminDb = getFirestore(adminApp);
