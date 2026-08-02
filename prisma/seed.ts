// Seed del Marketplace_Tunapuy (docs/architecture.md §4).
//
// Controlado por DATA_MODE (env):
//   mock → datos ficticios de demostración (desarrollo / preview).
//   real → solo el catálogo base (las 6 categorías), idempotente, sin borrar nada.
//
// Idempotencia: upsert por claves naturales (slug / phoneNumber). Se puede
// ejecutar N veces sin duplicar datos.
//
// Teléfonos mock: son OBVIAMENTE ficticios (E.164 con prefijo +58 000...,
// números que no existen en Venezuela) para que nadie los use como contacto real.

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { CATEGORIES } from "../src/lib/constants";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida (revisa tu .env)");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DATA_MODE = process.env.DATA_MODE ?? "mock";

const HOUR = 60 * 60 * 1000;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);

// ---------------------------------------------------------------------------
// Catálogo base: las 6 categorías fijas (siempre, en ambos modos)
// ---------------------------------------------------------------------------

async function seedCategories(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        icon: cat.icon,
        position: cat.position,
      },
      create: {
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        position: cat.position,
      },
    });
    ids.set(cat.slug, row.id);
    console.log(`  • categoría "${cat.name}" (${cat.slug}) ok`);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Datos mock (DATA_MODE=mock)
// ---------------------------------------------------------------------------
// Teléfonos ficticios: +58 000... NO son números reales válidos en Venezuela.
// Solo existen en el entorno de demostración para no contactar a nadie.

interface MockSeller {
  phoneNumber: string;
  email: string;
  name: string;
}

const MOCK_SELLERS: MockSeller[] = [
  { phoneNumber: "+580000000001", email: "ana.perez@tunapuy.local", name: "Ana Pérez" },
  { phoneNumber: "+580000000002", email: "carlos.rojas@tunapuy.local", name: "Carlos Rojas" },
  { phoneNumber: "+580000000003", email: "maria.gonzalez@tunapuy.local", name: "María González" },
  { phoneNumber: "+580000000004", email: "jorge.medina@tunapuy.local", name: "Jorge Medina" },
  { phoneNumber: "+580000000005", email: "pedro.silva@tunapuy.local", name: "Pedro Silva" },
  { phoneNumber: "+580000000006", email: "luisa.fernandez@tunapuy.local", name: "Luisa Fernández" },
];

interface MockBusiness {
  slug: string;
  name: string;
  description: string;
  ownerPhone: string;
  phoneNumber: string; // también ficticio
}

const MOCK_BUSINESSES: MockBusiness[] = [
  {
    slug: "arepas-dona-ana",
    name: "Arepas Doña Ana",
    description: "Comida casera venezolana (datos de demostración)",
    ownerPhone: "+580000000001",
    phoneNumber: "+580000000011",
  },
  {
    slug: "moda-tunapuy",
    name: "Moda Tunapuy",
    description: "Ropa casual y formal (datos de demostración)",
    ownerPhone: "+580000000002",
    phoneNumber: "+580000000012",
  },
  {
    slug: "calzado-el-paso",
    name: "Calzado El Paso",
    description: "Zapatos y sandalias (datos de demostración)",
    ownerPhone: "+580000000003",
    phoneNumber: "+580000000013",
  },
  {
    slug: "perfumeria-bella",
    name: "Perfumería Bella",
    description: "Perfumes y colonias (datos de demostración)",
    ownerPhone: "+580000000004",
    phoneNumber: "+580000000014",
  },
  {
    slug: "autopartes-tunapuy",
    name: "Autopartes Tunapuy",
    description: "Repuestos y accesorios automotrices (datos de demostración)",
    ownerPhone: "+580000000005",
    phoneNumber: "+580000000015",
  },
  {
    slug: "licoreria-la-gorda",
    name: "Licorería La Gorda",
    description: "Bebidas y licores (datos de demostración)",
    ownerPhone: "+580000000006",
    phoneNumber: "+580000000016",
  },
];

interface MockProduct {
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  sellerPhone: string;
  businessSlug: string | null;
  priceUsd: string;
  offerPriceUsd: string | null;
  isFeatured: boolean;
  featuredOrder: number;
  publishedHoursAgo: number | null; // null → borrador (DRAFT)
  status: "ACTIVE" | "DRAFT";
}

// Todos los teléfonos de anuncio son ficticios (heredados del negocio/vendedor).
const MOCK_PRODUCTS: MockProduct[] = [
  // --- Comida ---
  {
    slug: "arepa-reina-pepiada",
    title: "Arepa Reina Pepiada",
    description: "Arepa de maíz rellena de pollo con aguacate (demo)",
    categorySlug: "comida",
    sellerPhone: "+580000000001",
    businessSlug: "arepas-dona-ana",
    priceUsd: "3.50",
    offerPriceUsd: null,
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 3,
    status: "ACTIVE",
  },
  {
    slug: "empanadas-de-carne-docena",
    title: "Empanadas de Carne (docena)",
    description: "Docena de empanadas de carne molida (demo)",
    categorySlug: "comida",
    sellerPhone: "+580000000001",
    businessSlug: "arepas-dona-ana",
    priceUsd: "12.00",
    offerPriceUsd: "10.50",
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 26,
    status: "ACTIVE",
  },
  // --- Ropa ---
  {
    slug: "camisa-lino-azul-marino",
    title: "Camisa de Lino Azul Marino",
    description: "Camisa de lino manga larga, tallas S–XL (demo)",
    categorySlug: "ropa",
    sellerPhone: "+580000000002",
    businessSlug: "moda-tunapuy",
    priceUsd: "25.00",
    offerPriceUsd: null,
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 5,
    status: "ACTIVE",
  },
  {
    slug: "jean-clasico-azul",
    title: "Jean Clásico Azul",
    description: "Jean de corte clásico, 32–38 (demo)",
    categorySlug: "ropa",
    sellerPhone: "+580000000002",
    businessSlug: "moda-tunapuy",
    priceUsd: "22.50",
    offerPriceUsd: "18.99",
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 48,
    status: "ACTIVE",
  },
  // --- Zapatos ---
  {
    slug: "zapatillas-deportivas-urbanas",
    title: "Zapatillas Deportivas Urbanas",
    description: "Zapatillas ligeras, tallas 38–44 (demo)",
    categorySlug: "zapatos",
    sellerPhone: "+580000000003",
    businessSlug: "calzado-el-paso",
    priceUsd: "45.00",
    offerPriceUsd: null,
    isFeatured: true,
    featuredOrder: 2,
    publishedHoursAgo: 24,
    status: "ACTIVE",
  },
  {
    slug: "sandalias-de-cuero-artesanales",
    title: "Sandalias de Cuero Artesanales",
    description: "Hechas a mano, tallas 36–42 (demo)",
    categorySlug: "zapatos",
    sellerPhone: "+580000000003",
    businessSlug: "calzado-el-paso",
    priceUsd: "30.00",
    offerPriceUsd: null,
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 96,
    status: "ACTIVE",
  },
  // --- Perfume ---
  {
    slug: "perfume-ambre-oriental",
    title: "Perfume Ámbar Oriental 100ml",
    description: "Eau de parfum, notas amaderadas (demo)",
    categorySlug: "perfume",
    sellerPhone: "+580000000004",
    businessSlug: "perfumeria-bella",
    priceUsd: "55.00",
    offerPriceUsd: null,
    isFeatured: true,
    featuredOrder: 1,
    publishedHoursAgo: 7,
    status: "ACTIVE",
  },
  {
    slug: "colonia-fresca-citrica",
    title: "Colonia Fresca Cítrica 50ml",
    description: "Eau de toilette para uso diario (demo)",
    categorySlug: "perfume",
    sellerPhone: "+580000000004",
    businessSlug: "perfumeria-bella",
    priceUsd: "38.99",
    offerPriceUsd: "34.50",
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 72,
    status: "ACTIVE",
  },
  // --- Automotriz ---
  {
    slug: "aceite-motor-10w30",
    title: "Aceite de Motor 10W-30 (1L)",
    description: "Aceite multigrado para gasolina (demo)",
    categorySlug: "automotriz",
    sellerPhone: "+580000000005",
    businessSlug: "autopartes-tunapuy",
    priceUsd: "18.75",
    offerPriceUsd: null,
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 9,
    status: "ACTIVE",
  },
  {
    slug: "limpiaparabrisas-paquete",
    title: "Limpiaparabrisas (par)",
    description: "Juego de limpiaparabrisas 24\" (demo)",
    categorySlug: "automotriz",
    sellerPhone: "+580000000005",
    businessSlug: "autopartes-tunapuy",
    priceUsd: "8.50",
    offerPriceUsd: null,
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 120,
    status: "ACTIVE",
  },
  {
    slug: "paquete-bujias-iridio",
    title: "Bujías de Iridio (set de 4)",
    description: "Borrador de ejemplo: aún no publicado (demo)",
    categorySlug: "automotriz",
    sellerPhone: "+580000000005",
    businessSlug: "autopartes-tunapuy",
    priceUsd: "26.00",
    offerPriceUsd: null,
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: null,
    status: "DRAFT",
  },
  // --- Licor ---
  {
    slug: "ron-anejo-extra",
    title: "Ron Añejo Extra 750ml",
    description: "Ron venezolano añejado en barrica (demo)",
    categorySlug: "licor",
    sellerPhone: "+580000000006",
    businessSlug: "licoreria-la-gorda",
    priceUsd: "35.00",
    offerPriceUsd: null,
    isFeatured: true,
    featuredOrder: 0,
    publishedHoursAgo: 2,
    status: "ACTIVE",
  },
  {
    slug: "vino-tinto-reserva",
    title: "Vino Tinto Reserva 750ml",
    description: "Vino tinto de mesa (demo)",
    categorySlug: "licor",
    sellerPhone: "+580000000006",
    businessSlug: "licoreria-la-gorda",
    priceUsd: "22.99",
    offerPriceUsd: "19.99",
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 144,
    status: "ACTIVE",
  },
];

async function seedMock(): Promise<void> {
  console.log("Seed mock: creando vendedores, negocios y productos ficticios…");

  // Vendedores (upsert por phoneNumber, identificador de login).
  const sellerIds = new Map<string, string>();
  for (const seller of MOCK_SELLERS) {
    const row = await prisma.user.upsert({
      where: { phoneNumber: seller.phoneNumber },
      update: { name: seller.name, email: seller.email, role: "SELLER" },
      create: {
        phoneNumber: seller.phoneNumber,
        email: seller.email,
        name: seller.name,
        role: "SELLER",
      },
    });
    sellerIds.set(seller.phoneNumber, row.id);
  }

  // Negocios (upsert por slug).
  const businessIds = new Map<string, string>();
  for (const biz of MOCK_BUSINESSES) {
    const ownerId = sellerIds.get(biz.ownerPhone);
    if (!ownerId) throw new Error(`Owner no encontrado para ${biz.slug}`);
    const row = await prisma.business.upsert({
      where: { slug: biz.slug },
      update: {
        name: biz.name,
        description: biz.description,
        phoneNumber: biz.phoneNumber,
      },
      create: {
        slug: biz.slug,
        name: biz.name,
        description: biz.description,
        phoneNumber: biz.phoneNumber,
        ownerId,
      },
    });
    businessIds.set(biz.slug, row.id);
  }

  // Productos (upsert por slug; publishedAt solo se fija al crear).
  for (const p of MOCK_PRODUCTS) {
    const sellerId = sellerIds.get(p.sellerPhone);
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: p.categorySlug },
    });
    const businessId = p.businessSlug ? businessIds.get(p.businessSlug) : null;
    const phoneNumber = businessId
      ? (await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).phoneNumber ?? p.sellerPhone
      : p.sellerPhone;
    if (!sellerId) throw new Error(`Seller no encontrado para ${p.slug}`);

    const base = {
      slug: p.slug,
      title: p.title,
      description: p.description,
      priceUsd: p.priceUsd,
      offerPriceUsd: p.offerPriceUsd,
      phoneNumber,
      status: p.status,
      isFeatured: p.isFeatured,
      featuredOrder: p.featuredOrder,
      categoryId: category.id,
      sellerId,
      businessId,
    };

    await prisma.product.upsert({
      where: { slug: p.slug },
      update: base,
      create: {
        ...base,
        publishedAt: p.publishedHoursAgo === null ? null : hoursAgo(p.publishedHoursAgo),
        images: {
          create: [
            {
              url: "/placeholder.svg",
              key: `seed/${p.slug}/main`,
              alt: p.title,
              position: 0,
            },
          ],
        },
      },
    });
  }

  console.log("Seed mock completado (idempotente: puedes volver a ejecutarlo).");
}

async function main(): Promise<void> {
  console.log(`Seed iniciado (DATA_MODE=${DATA_MODE})`);

  // Siempre: catálogo base idempotente.
  await seedCategories();

  if (DATA_MODE === "mock") {
    await seedMock();
  } else if (DATA_MODE === "real") {
    console.log("Modo real: solo catálogo base (sin datos ficticios).");
  } else {
    throw new Error(`DATA_MODE inválido: "${DATA_MODE}" (opciones: mock | real)`);
  }

  console.log("Seed finalizado.");
}

main()
  .catch((err) => {
    console.error("Seed falló:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
