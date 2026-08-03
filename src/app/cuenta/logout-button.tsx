// Botón de cierre de sesión (cliente) — llama a POST /api/auth/logout y
// redirige a la home.
"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={handleLogout}>
      <LogOut aria-hidden="true" className="size-4" />
      Cerrar sesión
    </Button>
  );
}
