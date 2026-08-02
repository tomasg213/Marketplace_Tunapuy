// Constantes de negocio compartidas entre el cliente y el servidor.
// (documentadas en docs/architecture.md §1.1 y §2.1)

// Categorías fijas del marketplace (seed idempotente, tabla `Category`).
export const CATEGORIES = [
  { slug: "comida", name: "Comida", icon: "UtensilsCrossed", position: 1 },
  { slug: "ropa", name: "Ropa", icon: "Shirt", position: 2 },
  { slug: "zapatos", name: "Zapatos", icon: "Footprints", position: 3 },
  { slug: "perfume", name: "Perfume", icon: "SprayCan", position: 4 },
  { slug: "automotriz", name: "Automotriz", icon: "Car", position: 5 },
  { slug: "licor", name: "Licor", icon: "Wine", position: 6 },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

// Estado de un producto (String + unión TS, validado con zod en el borde).
export const PRODUCT_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ARCHIVED: "ARCHIVED",
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
