# Luqui Dashboard 🚀

Dashboard en tiempo real para el sistema de créditos libranza de Luqui.  
Construido con React + Vite. Desplegado en **Cloudflare Pages** (gratis).

---

## ⚡ Deploy en Cloudflare Pages (paso a paso)

### 1. Prepara el repositorio
1. Crea una cuenta en [GitHub](https://github.com) si no tienes una.
2. Sube esta carpeta como un repositorio nuevo:
   ```
   git init
   git add .
   git commit -m "Luqui Dashboard inicial"
   git remote add origin https://github.com/TU_USUARIO/luqui-dashboard.git
   git push -u origin main
   ```

### 2. Conecta con Cloudflare Pages
1. Ve a [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages** → **Create a project**
2. Conecta tu cuenta de GitHub y selecciona el repositorio `luqui-dashboard`
3. En la configuración de build:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`

### 3. Configura las variables de entorno
En Cloudflare Pages → tu proyecto → **Settings → Environment Variables**, agrega:

| Variable              | Valor                                  |
|-----------------------|----------------------------------------|
| `AIRTABLE_TOKEN`      | Tu Personal Access Token de Airtable   |
| `AIRTABLE_BASE_ID`    | `appcS2RlqK703VC1O`                    |

> **¿Cómo obtener el token de Airtable?**  
> Ve a [airtable.com/create/tokens](https://airtable.com/create/tokens)  
> Crea un token con scopes: `data.records:read` y `schema.bases:read`  
> Agrega acceso a la base **Luqui**

### 4. Despliega
Haz clic en **Save and Deploy**. ¡Listo! 🎉

Cada vez que hagas un `git push`, Cloudflare recompila y despliega automáticamente.

---

## 🔄 Actualización de datos
El dashboard tiene un botón **⟳ Actualizar** que recarga los datos desde Airtable en tiempo real. También puedes recargar la página.

## 🛠 Desarrollo local
```bash
npm install
# Crea .env.local con tus variables (ver .env.example)
npm run dev
```

---

## 📁 Estructura del proyecto
```
luqui-dashboard/
├── src/
│   ├── App.jsx          # Dashboard completo
│   └── main.jsx         # Punto de entrada React
├── functions/
│   └── api/
│       └── airtable.js  # Cloudflare Pages Function (proxy seguro a Airtable)
├── index.html
├── vite.config.js
└── package.json
```
