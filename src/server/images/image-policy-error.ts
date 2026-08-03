// Error controlado de política de imágenes (épica E3 — perfiles editables).
//
// Defensa en profundidad (dictamen H1-SEC): la política de imágenes
// (`assertUploadedImageUrl`) se aplica en los SERVICIOS
// (`users/profile-service.ts`, `business/service.ts`), no en la capa de acción.
// Cuando una URL de avatar/logo no apunta a `/uploads/<folder>/` de NUESTRO
// origen, el servicio lanza `ImagePolicyError` con el mensaje específico del
// validador subyacente (p.ej. "La imagen debe apuntar a /uploads/users/").
// La UI muestra `err.message`; nunca un 500 ni un mensaje genérico.
export class ImagePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePolicyError";
  }
}
