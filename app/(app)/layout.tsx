import { redirect } from "next/navigation";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import { NavPrincipal } from "@/components/nav-principal";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await obtenerUsuarioSesion();
  if (!usuario) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <NavPrincipal usuario={usuario} />
      <main className="min-w-0 flex-1 bg-background">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
