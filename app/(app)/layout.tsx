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
    <div className="flex min-h-screen">
      <NavPrincipal usuario={usuario} />
      <main className="flex-1 overflow-y-auto bg-background p-6">{children}</main>
    </div>
  );
}
