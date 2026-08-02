# AGENTS.md

Convenciones compartidas para todos los agentes de este proyecto.

## Proyecto

- **Producto:** Marketplace público (nombre provisional: Marketplace_Tunapuy).
- **Stack:** Next.js (App Router) + TypeScript, backend propio (API routes), base de datos relacional con Prisma.
- **UI:** Tailwind CSS y componentes con shadcn/ui (patrón: componentes + estilos accesibles).
- **Pagos:** Integración de pasarela de pagos (Stripe u otra a definir).
- **Idioma:** Los agentes responden, comentan y documentan **en español**. Código, variables y nombres de funciones en inglés.

## Equipo de agentes

| Agente | Rol |
|---|---|
| `product-manager` | Orquesta el desarrollo, define épicas, delega en los subagentes. Agente default. |
| `design-advisor` | Asesor de diseño UX/UI, accesibilidad y arquitectura de información (solo consulta). |
| `designer` | Implementa componentes, estilos y el design system. |
| `tech-architect` | Asesor e ingeniero técnico: arquitectura, modelo de datos, API, integraciones. |
| `qa-engineer` | Escribe y ejecuta pruebas, revisa calidad y casos borde. |
| `security-reviewer` | Audita seguridad: auth, pagos, OWASP Top 10, dependencias. |
| `devops-engineer` | CI/CD, despliegue, variables de entorno, monitoreo. |

## Cómo colaborar

- El `product-manager` desglosa el trabajo y delega tareas concretas a los subagentes vía la herramienta de tareas.
- Un subagente solo implementa lo que le fue delegado y reporta el resultado al agente que lo invocó.
- Antes de implementar una función nueva: consulta a `design-advisor` (UX) y `tech-architect` (arquitectura).
- Después de implementar: ejecuta `qa-engineer` para validar y `security-reviewer` si toca auth/pagos/datos sensibles.
- Toda funcionalidad de pagos o datos personales requiere aprobación del `security-reviewer`.

## Comandos estándar

Cuando el proyecto esté scaffolded:

```bash
npm run dev        # entorno de desarrollo
npm run build      # build de producción
npm run lint       # ESLint
npm run test       # pruebas unitarias (Vitest)
npm run test:e2e   # pruebas E2E (Playwright)
npx prisma migrate dev   # migraciones de base de datos
```

## Estructura esperada

```
src/
  app/          # rutas Next.js (App Router)
  components/   # componentes React
  lib/          # lógica de negocio, utilidades
  server/       # lógica de servidor (API, auth, pagos)
prisma/
docs/           # documentación de producto y decisiones
tests/
```

## Reglas

- No se commitean secretos ni variables de entorno reales (usar `.env.example`).
- Todo cambio relevante debe tener cobertura de prueba o justificación explícita del PM.
- Las decisiones de arquitectura importantes se registran en `docs/`.
