// Constantes de negocio compartidas entre el cliente y el servidor.
// (documentadas en docs/architecture.md §1.1 y §2.1)

// Categorías fijas del marketplace (seed idempotente, tabla `Category`).
// Positions: las 6 originales quedan 1–6; las 7 nuevas van 7–13.
export const CATEGORIES = [
  { slug: "comida", name: "Comida", icon: "UtensilsCrossed", position: 1 },
  { slug: "ropa", name: "Ropa", icon: "Shirt", position: 2 },
  { slug: "zapatos", name: "Zapatos", icon: "Footprints", position: 3 },
  { slug: "perfume", name: "Perfume", icon: "SprayCan", position: 4 },
  { slug: "automotriz", name: "Automotriz", icon: "Car", position: 5 },
  { slug: "licor", name: "Licor", icon: "Wine", position: 6 },
  { slug: "tecnologia", name: "Tecnología", icon: "Smartphone", position: 7 },
  { slug: "servicios", name: "Servicios", icon: "Briefcase", position: 8 },
  { slug: "joyas", name: "Joyas", icon: "Gem", position: 9 },
  { slug: "manufactura", name: "Manufactura", icon: "Factory", position: 10 },
  { slug: "artesanias", name: "Artesanías", icon: "Palette", position: 11 },
  { slug: "construccion", name: "Construcción", icon: "HardHat", position: 12 },
  { slug: "ferreteria", name: "Ferretería", icon: "Wrench", position: 13 },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

// Estado de un producto (String + unión TS, validado con zod en el borde).
export const PRODUCT_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ARCHIVED: "ARCHIVED",
  SOLD: "SOLD", // marcado como agotado (Épica E2)
} as const;

export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

// Rol de usuario (String + unión TS).
export const USER_ROLE = {
  BUYER: "BUYER",
  SELLER: "SELLER",
  ADMIN: "ADMIN",
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

// Tipo de código OTP (String + unión TS; columna `OtpCode.type`).
export const OTP_TYPE = {
  LOGIN: "LOGIN",
  REGISTER: "REGISTER",
} as const;

export type OtpType = (typeof OTP_TYPE)[keyof typeof OTP_TYPE];

// Proveedor de envío de OTP (env OTP_PROVIDER).
export const OTP_PROVIDER = {
  DEV: "dev",
  WHATSAPP: "whatsapp",
} as const;

// Origen de la tasa BCV devuelta por `getBcvRate()` (para depuración/UI).
export const RATE_ORIGIN = {
  MEMORY: "memory",
  DB: "db",
  API: "api",
  STALE: "stale",
  FALLBACK: "fallback",
} as const;

// Clave natural de la fila RateCache (fuente de la tasa).
export const RATE_SOURCE = "dolarapi-oficial";

// Límites de negocio
export const PRODUCTS_PER_HOME = 12;
export const OTP_CODE_LENGTH = 6;
