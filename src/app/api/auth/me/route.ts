// GET /api/auth/me — usuario autenticado (mínimos datos públicos) o 401.
//
// Minimización de datos (docs/architecture.md §Auth): solo id, name,
// phoneNumber, role, slug, businessId y avatarUrl. Nunca email, OtpCode,
// ni datos internos.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  return NextResponse.json({ user }, { status: 200 });
}
