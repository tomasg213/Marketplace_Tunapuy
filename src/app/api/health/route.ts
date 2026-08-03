// Health check del marketplace (docs/monitoring.md §2).
//
// GET /api/health → { status, db } con el estado de la base de datos.
// Lo consumen los probes de uptime (UptimeRobot/Better Stack/el de Vercel) y
// los liveness checks del orquestador si algún día se self-hostea.
//
//   - 200 { status: "ok", db: true }       → app y BD disponibles.
//   - 503 { status: "degraded", db: false } → BD inaccesible (la app puede
//     seguir sirviendo con la caché de tasa BCV y datos en memoria, pero es
//     señal de alerta temprana).
import { NextResponse } from "next/server";
import { db } from "@/server/db";

// No se prerenderiza ni cachea: siempre reporta el estado real.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: true }, { status: 200 });
  } catch (error) {
    // Log estructurado simple (docs/monitoring.md §1): el correlator agrupa por
    // servicio. No se filtra el detalle del error al cliente.
    console.error("[health] base de datos no accesible:", {
      service: "api-health",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { status: "degraded", db: false },
      { status: 503 },
    );
  }
}
