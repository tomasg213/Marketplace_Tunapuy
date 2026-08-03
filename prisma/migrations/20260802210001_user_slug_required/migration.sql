-- AlterTable: User.slug ya fue rellenado por el backfill
-- (prisma/backfill-user-slugs.ts) → ahora es obligatorio.
ALTER TABLE "User" ALTER COLUMN "slug" SET NOT NULL;
