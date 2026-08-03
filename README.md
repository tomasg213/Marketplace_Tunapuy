This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Marketplace_Tunapuy

Vitrina de productos locales (Next.js App Router + TypeScript + Prisma +
PostgreSQL). Documentación relevante:

- `docs/architecture.md` — arquitectura técnica (modelo de datos, tasa BCV, auth OTP, mock vs real).
- `docs/deployment.md` — CI/CD, estrategia por rama, hosting y mapa de variables por entorno.
- `docs/monitoring.md` — observabilidad mínima (health, logs, alertas de la tasa BCV).
- `docs/roadmap.md` — épicas E0–E5 y estado del backlog.

## Datos de demostración (DATA_MODE=mock)

El seed (`prisma/seed.ts`) crea 10 vendedores, 10 negocios y 17 productos ficticios
con imágenes ilustrativas locales en `public/images/seed/` (una por producto,
misma URL que el slug). Las imágenes provienen de:

- **Unsplash** (licencia Unsplash — uso libre, sin atribución obligatoria): jeans,
  perfumes, ron/whisky, vino.
- **Flickr CC** (vía Openverse, licencias `by` / `by-sa`): arepa, empanadas, camisa,
  zapatillas, sandalias, bujías, aire acondicionado, anillos, mesa de madera, taladro.
- **Wikimedia Commons** (licencias `by-sa`): aceite de motor, limpiaparabrisas.

Re-ejecuta el seed para regenerar los datos demo (idempotente):

```bash
npm run db:seed
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
