// Seed del Marketplace_Tunapuy (docs/architecture.md §4).
//
// Controlado por DATA_MODE (env):
//   mock → datos ficticios de demostración (desarrollo / preview).
//   real → solo el catálogo base (las 13 categorías), idempotente, sin borrar nada.
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
import { slugify } from "../src/lib/slug";
import { backfillUserSlugs } from "../src/server/users/user-slugs";

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
// Catálogo base: las 13 categorías fijas (siempre, en ambos modos)
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
  { phoneNumber: "+580000000007", email: "rosa.delgado@tunapuy.local", name: "Rosa Delgado" },
  { phoneNumber: "+580000000008", email: "elena.castillo@tunapuy.local", name: "Elena Castillo" },
  { phoneNumber: "+580000000009", email: "sofia.rivas@tunapuy.local", name: "Sofía Rivas" },
  { phoneNumber: "+580000000010", email: "diego.salazar@tunapuy.local", name: "Diego Salazar" },
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
  {
    slug: "clima-tunapuy",
    name: "Clima Tunapuy",
    description: "Servicios técnicos de climatización (datos de demostración)",
    ownerPhone: "+580000000007",
    phoneNumber: "+580000000017",
  },
  {
    slug: "joyeria-castillo",
    name: "Joyería Castillo",
    description: "Joyas y orfebrería fina (datos de demostración)",
    ownerPhone: "+580000000008",
    phoneNumber: "+580000000018",
  },
  {
    slug: "artesanias-rivas",
    name: "Artesanías Rivas",
    description: "Artesanía y madera tallada (datos de demostración)",
    ownerPhone: "+580000000009",
    phoneNumber: "+580000000019",
  },
  {
    slug: "ferreteria-el-tornillo",
    name: "Ferretería El Tornillo",
    description: "Herramientas e insumos de ferretería (datos de demostración)",
    ownerPhone: "+580000000010",
    phoneNumber: "+580000000020",
  },
];

interface MockProduct {
  slug: string;
  title: string;
  description: string;
  categorySlugs: string[]; // 1–3 categorías; [0] es la principal (position 0)
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
    categorySlugs: ["comida"],
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
    categorySlugs: ["comida"],
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
    categorySlugs: ["ropa", "manufactura"],
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
    categorySlugs: ["ropa"],
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
    categorySlugs: ["zapatos"],
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
    categorySlugs: ["zapatos", "artesanias"],
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
    categorySlugs: ["perfume"],
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
    categorySlugs: ["perfume"],
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
    categorySlugs: ["automotriz"],
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
    categorySlugs: ["automotriz"],
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
    categorySlugs: ["automotriz"],
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
    categorySlugs: ["licor"],
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
    categorySlugs: ["licor"],
    sellerPhone: "+580000000006",
    businessSlug: "licoreria-la-gorda",
    priceUsd: "22.99",
    offerPriceUsd: "19.99",
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 144,
    status: "ACTIVE",
  },
  // --- Servicios / Tecnología ---
  {
    slug: "reparacion-aires-acondicionados",
    title: "Reparación de Aires Acondicionados",
    description: "Servicio técnico de climatización: diagnóstico y reparación (demo)",
    categorySlugs: ["servicios", "tecnologia"],
    sellerPhone: "+580000000007",
    businessSlug: "clima-tunapuy",
    priceUsd: "25.00",
    offerPriceUsd: null,
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 10,
    status: "ACTIVE",
  },
  // --- Joyas ---
  {
    slug: "anillo-oro-18k",
    title: "Anillo de Oro 18k",
    description: "Anillo de oro de 18 kilates con acabado pulido (demo)",
    categorySlugs: ["joyas"],
    sellerPhone: "+580000000008",
    businessSlug: "joyeria-castillo",
    priceUsd: "180.00",
    offerPriceUsd: null,
    isFeatured: true,
    featuredOrder: 3,
    publishedHoursAgo: 6,
    status: "ACTIVE",
  },
  // --- Artesanías / Manufactura ---
  {
    slug: "mesa-madera-tallada",
    title: "Mesa de Madera Tallada",
    description: "Mesa de madera maciza tallada a mano (demo)",
    categorySlugs: ["artesanias", "manufactura"],
    sellerPhone: "+580000000009",
    businessSlug: "artesanias-rivas",
    priceUsd: "120.00",
    offerPriceUsd: null,
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 30,
    status: "ACTIVE",
  },
  // --- Ferretería / Construcción ---
  {
    slug: "taladro-percutor",
    title: "Taladro Percutor",
    description: "Taladro percutor con mandril de 13 mm y maletín (demo)",
    categorySlugs: ["ferreteria", "construccion"],
    sellerPhone: "+580000000010",
    businessSlug: "ferreteria-el-tornillo",
    priceUsd: "65.00",
    offerPriceUsd: "58.50",
    isFeatured: false,
    featuredOrder: 0,
    publishedHoursAgo: 18,
    status: "ACTIVE",
  },
];

async function seedMock(): Promise<void> {
  console.log("Seed mock: creando vendedores, negocios y productos ficticios…");

  // Vendedores (upsert por phoneNumber, identificador de login).
  // BUG FIX: el slug SOLO se setea en `create`; el `update` ya no lo pisa
  // (permalinga estable: si el vendedor cambia de nombre, el slug no cambia).
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
        slug: slugify(seller.name),
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
    const businessId = p.businessSlug ? businessIds.get(p.businessSlug) : null;
    const phoneNumber = businessId
      ? (await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).phoneNumber ?? p.sellerPhone
      : p.sellerPhone;
    if (!sellerId) throw new Error(`Seller no encontrado para ${p.slug}`);

    // Mismo patrón que `images`: en create se conectan las categorías y en
    // update se reemplazan (deleteMany + create) para reflejar categorySlugs.
    const categories = {
      create: p.categorySlugs.map((slug, position) => ({
        category: { connect: { slug } },
        position,
      })),
    };

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
      sellerId,
      businessId,
    };

    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        ...base,
        categories: { deleteMany: {}, create: p.categorySlugs.map((slug, position) => ({
          category: { connect: { slug } },
          position,
        })) },
      },
      create: {
        ...base,
        publishedAt: p.publishedHoursAgo === null ? null : hoursAgo(p.publishedHoursAgo),
        categories,
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

  // Backfill de slugs pendientes (idempotente): cubre usuarios creados antes de
  // la migración E2 sin la necesidad de correr el script aparte.
  const backfilled = await backfillUserSlugs(prisma);
  if (backfilled > 0) {
    console.log(`  • backfill de User.slug: ${backfilled} usuario(s) actualizado(s)`);
  }

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
