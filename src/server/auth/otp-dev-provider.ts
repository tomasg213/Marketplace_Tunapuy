// Proveedor OTP de desarrollo: registra el código en la consola del servidor.
// NO envía nada real. Úsalo solo con OTP_PROVIDER=dev (nunca en producción).
import type { OtpProvider } from "@/server/auth/otp-provider";

export class OtpDevProvider implements OtpProvider {
  readonly name = "dev";

  async send(phoneNumber: string, code: string): Promise<void> {
    // Visible en los logs del servidor `npm run dev` (solo desarrollo).
    console.log(
      `[OTP:dev] Código de verificación para ${phoneNumber}: ${code} (solo desarrollo, no se envía por ningún canal)`,
    );
  }
}

export const otpDevProvider = new OtpDevProvider();
