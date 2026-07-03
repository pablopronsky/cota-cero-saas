"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { iniciarSesion } from "@/lib/acciones/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const credencial = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credencial.user.getIdToken();
      startTransition(async () => {
        await iniciarSesion(idToken);
        router.push("/clientes");
        router.refresh();
      });
    } catch {
      setError("Email o contraseña incorrectos.");
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-hueso px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img
            src="/logo/cota_cero_logo_con_descriptor_outline.svg"
            alt="COTA CERO — Superficies y terminaciones"
            className="h-14"
          />
        </div>
        <Card className="overflow-visible border-t-2 border-t-cobre shadow-lg shadow-grafito/5">
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Presupuestador interno de COTA CERO</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="nombre@cotacero.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={enviando || pending}>
                {enviando || pending ? "Ingresando..." : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground italic">
          La diferencia está en la ejecución.
        </p>
      </div>
    </div>
  );
}
