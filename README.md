# Luqui Dashboard

Dashboard en tiempo real conectado a Airtable. Desplegado en **Cloudflare Pages** (gratis).

## Variables de entorno en Cloudflare Pages

En Settings → Environment variables, agrega estas DOS variables:

| Variable                | Valor                        |
|-------------------------|------------------------------|
| `VITE_AIRTABLE_TOKEN`   | Tu Personal Access Token     |
| `VITE_AIRTABLE_BASE_ID` | `appcS2RlqK703VC1O`          |

⚠️ IMPORTANTE: el nombre debe empezar con `VITE_` para que Vite las incluya en el build.

Después de agregar las variables, haz **Retry deployment**.

## Build settings

- Framework preset: None
- Build command: `npm run build`
- Build output directory: `dist`
