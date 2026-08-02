// Contrato de envío de códigos OTP + factory (docs/architecture.md §2.2).
// El código se genera con `generateOtpCode()` y se valida en `otp-utils.ts`.
import { OTP_PROVIDER } from "@/lib/constants";
import { otpDevProvider } from "@/server/auth/otp-dev-provider";
import { otpWhatsAppProvider } from "@/server/auth/otp-whatsapp-provider";

/** Proveedor capaz de enviar un código OTP a un teléfono. */
export interface OtpProvider {
  /** Nombre del proveedor (env OTP_PROVIDER): "dev" | "whatsapp". */
  readonly name: string;
  /**
   * Envía el código al teléfono (E.164).
   * Implementaciones: dev (consola) | whatsapp (Meta Cloud API — STUB).
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
 * Factory: elige el proveedor según `OTP_PROVIDER` (default "dev").
 * - "dev"      → imprime el código en la consola del servidor (desarrollo).
 * - "whatsapp" → Meta Cloud API (producción). STUB: aún no envía (E1).
 */
export function getOtpProvider(): OtpProvider {
  const provider = process.env.OTP_PROVIDER ?? OTP_PROVIDER.DEV;
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
