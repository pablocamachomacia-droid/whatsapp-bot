# WhatsApp Bot — Recepcionista virtual con IA

Bot de WhatsApp (Cloud API oficial de Meta) que actúa como recepcionista virtual para negocios: responde con Claude usando el contexto de cada negocio, detecta y captura citas/leads automáticamente, notifica al negocio por WhatsApp y expone un panel web (`/dashboard`) para gestionarlos.

## Arquitectura

- **Node.js + TypeScript + Express** — servidor HTTP y webhook.
- **WhatsApp Cloud API** — canal de mensajería (oficial, no requiere librerías no oficiales).
- **Anthropic Claude** — motor conversacional y extracción estructurada de citas.
- **JSON en disco** (`DATA_PATH/leads.json`) — persistencia de leads, con backup horario automático.
- **Dashboard estático** (`/dashboard`) — HTML/CSS/JS sin frameworks, consume la API interna.

## Variables de entorno

Copia `.env.example` a `.env` y rellena estos valores:

| Grupo | Variable | Descripción |
|---|---|---|
| Meta / WhatsApp | `WHATSAPP_VERIFY_TOKEN` | Token inventado por ti, debe coincidir con el configurado en Meta al dar de alta el webhook |
| Meta / WhatsApp | `WHATSAPP_ACCESS_TOKEN` | Access token permanente del System User (Meta Business) |
| Meta / WhatsApp | `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID del número de WhatsApp Business |
| Meta / WhatsApp | `WHATSAPP_API_VERSION` | Versión de la Graph API (por defecto `v21.0`) |
| Meta / WhatsApp | `APP_SECRET` | Clave secreta de tu app de Meta, usada para verificar la firma `X-Hub-Signature-256` de cada webhook |
| Anthropic | `ANTHROPIC_API_KEY` | API key de [console.anthropic.com](https://console.anthropic.com) |
| Seguridad | `INTERNAL_API_KEY` | Clave propia para proteger `/leads/*` y `/api/dashboard/*` (header `x-api-key`) |
| Configuración | `PORT` | Puerto local (Railway lo asigna solo en producción) |
| Configuración | `DATA_PATH` | Carpeta donde se guardan los leads. En Railway, apunta a un Volume montado para que persista entre redeploys |

## Desarrollo local

```bash
npm install
cp .env.example .env   # rellena las variables
npm run dev             # servidor con recarga en caliente (tsx)
```

Expón el puerto con `ngrok http 3000` para configurar la URL del webhook en el dashboard de Meta durante el desarrollo.

### Calidad y pruebas

```bash
npm run lint         # ESLint (TypeScript)
npm run build        # compila con tsc — falla si hay errores de tipos
npm run test:smoke   # arranca el servidor real y prueba los endpoints criticos
```

`test:smoke` levanta el servidor contra variables de entorno de prueba aisladas (puerto y `DATA_PATH` dedicados) y verifica con `fetch` nativo: `/health`, la verificación del webhook (token correcto/incorrecto), el rechazo de peticiones sin firma HMAC, la protección por API key de `/leads` y que `/dashboard` sirve la pantalla de login por defecto.

## Dar de alta un nuevo negocio (onboarding)

```bash
npm run onboard
```

CLI interactivo que pregunta nombre, tipo, Phone Number ID, servicios, horario y demás datos del negocio, y los añade automáticamente a `src/config/businesses.ts` (pide confirmación antes de guardar). Reinicia el servidor después para que tome efecto.

Si prefieres editar `businesses.ts` a mano, usa `examples/business-config-example.json` como plantilla comentada de referencia.

## Demo con datos de ejemplo

Ya hay un negocio de demo configurado (**Clínica Dental Demo Madrid**, `phoneNumberId` `333333333333333`) con servicios y horario reales. Para que el dashboard se vea lleno desde el primer momento:

```bash
npm run seed:demo
```

Carga 5 leads de ejemplo (distintos nombres, servicios, fechas y estados: nuevo, contactado, confirmado, cancelado) en `DATA_PATH/leads.json`. `data/` está en `.gitignore` a propósito (protege datos reales de clientes en producción), así que este comando es necesario tras cada clon nuevo o despliegue — la semilla versionada vive en `examples/demo-leads-seed.json`. Si ya hay leads guardados, pide confirmación antes de sobrescribir.

Para el argumentario técnico completo (stack, checklist de setup, requisitos, límites honestos y FAQ), ver [`PRODUCT.md`](./PRODUCT.md).

## Funciones conversacionales

- **Bienvenida y reactivación**: el primer mensaje de un cliente recibe un tono de bienvenida cálido; si vuelve a escribir tras más de 60 minutos de inactividad, Claude retoma la conversación con contexto.
- **Detección de intención crítica**: cada mensaje se analiza por keywords antes de responder — urgencias (dolor, sangrado, emergencia) disparan una notificación prioritaria inmediata al negocio; quejas y cancelaciones ajustan el tono de Claude y quedan marcadas en el lead (`intent`).
- **Resumen diario**: a las 20:00 (hora del servidor) cada negocio recibe por WhatsApp un resumen del día (mensajes, leads nuevos, confirmadas, pendientes de contactar).

## Seguridad de producción

- **Firma del webhook**: toda petición `POST /webhook` sin una firma `X-Hub-Signature-256` válida (HMAC-SHA256 con `APP_SECRET`) se rechaza con 401.
- **Rate limiting**: `/webhook` admite 100 peticiones/min por IP; `/leads/*` y `/api/dashboard/*` admiten 30/min por IP.
- **Helmet**: cabeceras de seguridad HTTP activas en todas las rutas.
- **Errores no controlados**: `uncaughtException` y `unhandledRejection` se capturan y registran (con timestamp y contexto) sin tumbar el proceso; el webhook siempre responde `200` a Meta aunque el procesamiento interno falle, para evitar reintentos en bucle.
- **Fallback de Claude**: si la API de Anthropic falla, el bot responde un mensaje de fallback amable en vez de romperse.

## Desplegar en Railway

1. Sube este repositorio a GitHub (si no lo has hecho ya).
2. En Railway: **New Project → Deploy from GitHub repo** y selecciona este repositorio.
3. En **Variables**, añade todas las variables de `.env.example` (usa valores reales, no los de ejemplo).
4. En **Volumes**, crea un volumen (ej. montado en `/data`) y define `DATA_PATH=/data` para que los leads no se pierdan en cada redeploy.
5. Railway detecta `railway.json`/`Procfile` y despliega automáticamente (`npm run build` → `npm start`). Copia la URL pública y configúrala como webhook en Meta (`https://tu-app.up.railway.app/webhook`), con `WHATSAPP_VERIFY_TOKEN` como token de verificación.

El healthcheck de Railway usa `GET /health` (sin autenticación), que expone `status`, `uptime`, `version`, `businessCount` y `totalLeads`.

## Endpoints principales

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | Ninguna | Estado del servicio para monitoring |
| GET/POST | `/webhook` | Verify token (GET) / firma Meta (POST) | Webhook de WhatsApp Cloud API |
| GET | `/leads/:businessId` | `x-api-key` | Lista de leads de un negocio |
| POST | `/leads/:id/status` | `x-api-key` | Cambia el estado de un lead |
| GET | `/api/dashboard/:businessId` | `x-api-key` | Datos agregados para el panel web |
| GET | `/dashboard` | Login propio (localStorage) | Panel web de gestión |
