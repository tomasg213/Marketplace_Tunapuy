// Proveedor OTP de producción vía WhatsApp (Meta Cloud API).
// STUB (E0): no implementa el envío real todavía. Configurables por env:
//   META_WHATSAPP_TOKEN
//   META_WHATSAPP_PHONE_NUMBER_ID
//   META_WHATSAPP_BUSINESS_ACCOUNT_ID (opcional, auditoría)
//   META_WHATSAPP_OTP_TEMPLATE (plantilla aprobada, ej. "otp_verification")
//
// Comportamiento del stub: valida la configuración y FALLA CERCADO (fail closed):
// si se elige este proveedor sin implementación real, no finge haber enviado nada.
// La implementación real (POST a graph.facebook.com) llega en E1 y debe pasar
// revisión de `security-reviewer` (token, rate limit, PII).
import {
  OtpProviderError,
  type OtpProvider,
} from "@/server/auth/otp-provider";

export class OtpWhatsAppProvider implements OtpProvider {
  readonly name = "whatsapp";

  async send(phoneNumber: string, code: string): Promise<void> {
    void code; // el código se usará en el cuerpo del template (E1)
    const token = process.env.META_WHATSAPP_TOKEN;
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      throw new OtpProviderError(
        "Meta Cloud API no configurada: faltan META_WHATSAPP_TOKEN y/o META_WHATSAPP_PHONE_NUMBER_ID",
      );
    }

    // TODO(E1): enviar el mensaje de plantilla con el código OTP:
    //   POST https://graph.facebook.com/v22.0/{phoneNumberId}/messages
    //   body: { messaging_product: "whatsapp", to: phoneNumber,
    //           type: "template", template: { name, language, components } }
    // Manejar: rate limits, plantilla no aprobada, estado de entrega.
    throw new OtpProviderError(
      `[OTP:whatsapp] Envío por WhatsApp aún no implementado (stub E0) para ${phoneNumber}`,
    );
  }
}

export const otpWhatsAppProvider = new OtpWhatsAppProvider();
