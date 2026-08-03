/*
  Migración "Categorías multi + fix fotos + perfiles editables" (épica E3):

  - Crea la tabla de unión "ProductCategory" (producto ↔ categoría, position
    0 = categoría principal para breadcrumb/ficha).
  - Backfill ANTES de dropear la columna "Product.categoryId": cada producto
    existente pasa a tener su ProductCategory con position 0.
  - Inserta las 7 categorías nuevas (tecnologia … ferreteria) con
    gen_random_uuid() (built-in desde PostgreSQL 13; verificado en el host 18.3)
    y ON CONFLICT ("slug") DO NOTHING por idempotencia.
  - Al final, dropea la FK, el índice y la columna "categoryId" viejos.
*/

-- DropForeignKey (la columna aún existe; se necesita para el backfill de abajo)
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- CreateTable
CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- Backfill: cada producto existente → su categoría como principal (position 0)
INSERT INTO "ProductCategory" ("productId", "categoryId", "position", "createdAt")
SELECT "id", "categoryId", 0, now() FROM "Product";

-- Categorías nuevas (7): slugs sin tilde, íconos lucide-react verificados.
INSERT INTO "Category" ("id", "slug", "name", "icon", "position", "createdAt") VALUES
    (gen_random_uuid(), 'tecnologia',   'Tecnología',    'Smartphone', 7,  now()),
    (gen_random_uuid(), 'servicios',    'Servicios',     'Briefcase',  8,  now()),
    (gen_random_uuid(), 'joyas',        'Joyas',         'Gem',        9,  now()),
    (gen_random_uuid(), 'manufactura',  'Manufactura',   'Factory',    10, now()),
    (gen_random_uuid(), 'artesanias',   'Artesanías',    'Palette',    11, now()),
    (gen_random_uuid(), 'construccion', 'Construcción',  'HardHat',    12, now()),
    (gen_random_uuid(), 'ferreteria',   'Ferretería',    'Wrench',     13, now())
ON CONFLICT ("slug") DO NOTHING;

-- DropIndex
DROP INDEX "Product_categoryId_status_idx";

-- AlterTable (el backfill ya se hizo: ahora sí se puede dropear la columna)
ALTER TABLE "Product" DROP COLUMN "categoryId";

-- CreateIndex
CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");

-- CreateIndex
CREATE INDEX "ProductCategory_productId_position_idx" ON "ProductCategory"("productId", "position");

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
