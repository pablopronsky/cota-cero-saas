"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { iniciarSesion } from "@/lib/acciones/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const credencial = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credencial.user.getIdToken();
      await iniciarSesion(idToken);
      router.push("/hoy");
      router.refresh();
    } catch {
      setError("El email o la contraseña no son correctos.");
      setEnviando(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-hueso">
      <div className="absolute inset-0 hidden md:block" aria-hidden="true">
        <Image
          src="/login-architectural-background.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(31,31,31,0.02)_0%,rgba(245,242,237,0.05)_37%,rgba(245,242,237,0.76)_54%,rgba(245,242,237,0.97)_100%)]" />
      </div>

      <div className="absolute inset-x-0 top-0 h-52 md:hidden" aria-hidden="true">
        <Image
          src="/login-architectural-background.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-left"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-grafito/5 via-hueso/25 to-hueso" />
      </div>

      <div className="relative grid min-h-dvh md:grid-cols-[44%_56%]">
        <div className="relative hidden md:block">
          <p className="absolute bottom-10 left-10 max-w-64 border-l border-white/55 pl-4 text-sm leading-relaxed tracking-wide text-white/85 drop-shadow-sm">
            La diferencia está en la ejecución.
          </p>
        </div>

        <section className="flex items-center justify-center px-4 py-10 sm:px-8 md:px-12 lg:px-16">
          <div className="w-full max-w-[460px]">
            <div className="mb-7 flex justify-center sm:mb-9">
              <Image
                src="/logo/cota_cero_logo_con_descriptor_outline.svg"
                alt="COTA CERO — Superficies y terminaciones"
                width={310}
                height={68}
                className="h-auto w-[235px] sm:w-[280px]"
                priority
              />
            </div>

            <div className="rounded-[1.5rem] border border-white/80 bg-white/90 px-5 py-7 shadow-[0_28px_80px_-32px_rgba(31,31,31,0.38)] backdrop-blur-xl sm:px-10 sm:py-10">
              <div className="mb-7 text-center">
                <div className="mb-4 flex items-center justify-center gap-3 text-[0.65rem] font-semibold tracking-[0.24em] text-cobre-oscuro">
                  <span className="h-px w-7 bg-cobre/55" />
                  ACCESO INTERNO
                  <span className="h-px w-7 bg-cobre/55" />
                </div>
                <h1 className="text-[1.65rem] font-semibold tracking-[-0.035em] text-grafito sm:text-[1.8rem]">
                  Bienvenido
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Ingresá al presupuestador de COTA CERO
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-grafito">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail
                      aria-hidden="true"
                      className="absolute left-3.5 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted-foreground/80"
                    />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoFocus
                      placeholder="nombre@cotacero.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "login-error" : undefined}
                      className="h-12 rounded-xl border-piedra/70 bg-white pl-11 pr-4 caret-cobre-oscuro shadow-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/65 hover:bg-white focus-visible:border-cobre focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-cobre/15 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#fff] [&:-webkit-autofill]:[-webkit-text-fill-color:#1f1f1f]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-grafito">
                    Contraseña
                  </Label>
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="absolute left-3.5 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted-foreground/80"
                    />
                    <Input
                      id="password"
                      name="password"
                      type={mostrarPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "login-error" : undefined}
                      className="h-12 rounded-xl border-piedra/70 bg-white pl-11 pr-12 caret-cobre-oscuro shadow-none transition-[border-color,box-shadow,background-color] hover:bg-white focus-visible:border-cobre focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-cobre/15 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#fff] [&:-webkit-autofill]:[-webkit-text-fill-color:#1f1f1f]"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarPassword((actual) => !actual)}
                      className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hueso hover:text-grafito focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobre"
                      aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      aria-pressed={mostrarPassword}
                    >
                      {mostrarPassword ? (
                        <EyeOff aria-hidden="true" className="size-[1.1rem]" />
                      ) : (
                        <Eye aria-hidden="true" className="size-[1.1rem]" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    id="login-error"
                    role="alert"
                    className="rounded-xl border border-destructive/15 bg-destructive/6 px-3.5 py-2.5 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="mt-1 h-12 w-full rounded-xl bg-cobre-oscuro text-base font-semibold shadow-[0_12px_26px_-14px_rgba(138,85,39,0.8)] transition-[transform,background-color,box-shadow] hover:bg-[#74451f] hover:shadow-[0_14px_28px_-14px_rgba(138,85,39,0.95)]"
                  disabled={enviando}
                >
                  {enviando ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                      Ingresando…
                    </>
                  ) : (
                    <>
                      Ingresar
                      <ArrowRight aria-hidden="true" className="ml-1 transition-transform group-hover/button:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 flex items-center justify-center gap-2 border-t border-border/70 pt-5 text-xs text-muted-foreground">
                <ShieldCheck aria-hidden="true" className="size-4 text-cobre-oscuro/80" />
                Acceso exclusivo para el equipo de COTA CERO
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
