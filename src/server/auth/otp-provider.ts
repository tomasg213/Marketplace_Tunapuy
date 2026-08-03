// Contrato de envío de códigos OTP + factory (docs/architecture.md §2.2).
// El código se genera con `generateOtpCode()` y se valida en `otp-utils.ts`.
import { OTP_PROVIDER } from "@/lib/constants";
import { env } from "@/server/env";
import { otpDevProvider } from "@/server/auth/otp-dev-provider";
import { otpWhatsAppProvider } from "@/server/auth/otp-whatsapp-provider";

/** Proveedor capaz de enviar un código OTP a un teléfono. */
export interface OtpProvider {
  /** Nombre del proveedor (env OTP_PROVIDER): "dev" | "whatsapp". */
  readonly name: string;
  /**
   * Envía el código al teléfono (E.164).
   * Implementaciones: dev (respuesta HTTP) | whatsapp (Meta Cloud API — STUB).
   */
  send(phoneNumber: string, code: string): Promise<void>;
}

/** Error controlado de la capa OTP (configuración, envío fallido...). */
export class OtpProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OtpProviderError";
  }
}

/**
 * ¿Es un despliegue local/mock (dev, staging de demo, e2e)? En esos entornos el
 * proveedor "dev" es legítimo (el servidor de producción local `next start`
 * corre con NODE_ENV=production y necesita el devCode para los tests e2e).
 * - `DATA_MODE=mock` → la app corre contra datos de semilla (dev/demo/e2e).
 * - `APP_URL` en localhost/127.0.0.1 → instalación local sobre http.
 * Cualquier despliegue real (DATA_MODE=db + dominio público) cae en la guarda.
 *
 * También lo usa auth.service.ts para saltarse el rate limit por IP en
 * local/mock: sin proxy headers el IP del cliente es "unknown" (bucket único
 * compartido por todos los requests locales) y tras `ipPerHour` requests se
 * bloquea la IP 30 min → rompe dev/e2e multi-ejecución. Los buckets por
 * teléfono (1/min, 5/h, 10/día) siguen activos en esos entornos.
 */
export function isLocalMockDeployment(): boolean {
  if (process.env.DATA_MODE === "mock") return true;
  // Se lee el env dinámicamente (con fallback al singleton validado) para que
  // los tests puedan forzar escenarios de producción sin reimportar módulos.
  const appUrl = process.env.APP_URL ?? env.APP_URL;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(appUrl);
}

/**
 * Factory: elige el proveedor según `OTP_PROVIDER` (default "dev").
 * - "dev"      → expone el código en `devCode` de la respuesta (desarrollo).
 * - "whatsapp" → Meta Cloud API (producción). STUB: aún no envía (E1).
 *
 * Guarda de producción (R7): `NODE_ENV=production && OTP_PROVIDER=dev` es un
 * error de arranque salvo que el despliegue sea local/mock (ver arriba). Se
 * evalúa AQUÍ (no en env.ts) porque `next build` corre con NODE_ENV=production
 * aunque el despliegue sea dev/e2e sobre http local; este factory es el punto
 * exacto donde se resuelve el proveedor en tiempo de ejecución.
 */
export function getOtpProvider(): OtpProvider {
  const provider = process.env.OTP_PROVIDER ?? OTP_PROVIDER.DEV;

  if (process.env.NODE_ENV === "production" && provider === OTP_PROVIDER.DEV && !isLocalMockDeployment()) {
    throw new OtpProviderError(
      "OTP_PROVIDER=dev no está permitido en producción. Configura OTP_PROVIDER=whatsapp y las credenciales META_*.",
    );
  }

  switch (provider) {
    case OTP_PROVIDER.WHATSAPP:
      return otpWhatsAppProvider;
    case OTP_PROVIDER.DEV:
      return otpDevProvider;
    default:
      throw new OtpProviderError(
        `OTP_PROVIDER desconocido: "${provider}" (opciones: ${OTP_PROVIDER.DEV} | ${OTP_PROVIDER.WHATSAPP})`,
      );
  }
}
