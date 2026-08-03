// Proveedor OTP de desarrollo (dictamen security E2 — R7).
//
// Solo desarrollo: no envía nada real. NO loguea el código ni el teléfono
// (R7: jamás registrar códigos/teléfonos). En su lugar registra un log anónimo
// y el código viaja por `devCode` en la respuesta del route handler, que la
// página /login muestra en un banner (`data-testid="otp-dev-code"`) para
// desarrollo y pruebas e2e. El guard de producción vive en `otp-provider.ts`.
import type { OtpProvider } from "@/server/auth/otp-provider";

export class OtpDevProvider implements OtpProvider {
  readonly name = "dev";

  // Firma del contrato OtpProvider; los parámetros no se usan porque el
  // código viaja en `devCode` de la respuesta, jamás en logs (R7).
  async send(phoneNumber: string, code: string): Promise<void> {
    void phoneNumber;
    void code;
    console.log("[OTP:dev] Código de verificación generado (devCode en la respuesta)");
  }
}

export const otpDevProvider = new OtpDevProvider();
