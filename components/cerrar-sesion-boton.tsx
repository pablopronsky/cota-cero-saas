"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { cerrarSesion } from "@/lib/acciones/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function CerrarSesionBoton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await signOut(auth);
      await cerrarSesion();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className="w-full justify-start text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground"
    >
      <LogOut className="size-4" />
      {pending ? "Cerrando..." : "Cerrar sesión"}
    </Button>
  );
}
