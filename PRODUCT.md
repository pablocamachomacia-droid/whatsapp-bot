# WhatsApp Bot — Recepcionista Virtual con IA

Documento técnico de referencia para clientes y equipos técnicos que evalúan, implantan o mantienen este producto.

---

## Stack técnico (para el cliente técnico)

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+ / TypeScript |
| Servidor HTTP | Express |
| Canal de mensajería | WhatsApp Cloud API (oficial de Meta — no usa librerías no oficiales) |
| Motor conversacional | Anthropic Claude (modelo configurable, por defecto `claude-sonnet-4-6`) |
| Persistencia | JSON en disco (`leads.json`), con backup horario automático y recuperación ante corrupción |
| Configuración de negocios | Código versionado (`src/config/businesses.ts`) o CLI de onboarding |
| Dashboard | HTML/CSS/JS sin frameworks — sin build, carga rápida |
| Seguridad | Verificación de firma HMAC del webhook, Helmet, rate limiting, clave interna para endpoints de gestión |
| Automatización | Tareas programadas (node-cron): backup horario, resumen diario, heartbeat de uptime |
| Despliegue | Railway (Nixpacks), configuración de un clic vía `railway.json` / `Procfile` |

**Por qué este stack:** prioriza simplicidad operativa y coste de mantenimiento bajo sobre "arquitectura de escala masiva". Es la elección correcta para un negocio individual o una cartera pequeña/mediana de negocios (ver limitaciones más abajo para saber cuándo conviene evolucionar).

---

## Qué incluye el setup (checklist)

- [x] Bot conversacional con IA, con contexto y tono propios de cada negocio (servicios, precios, horario, instrucciones específicas)
- [x] Multi-negocio: varios números de WhatsApp gestionados desde una única instalación
- [x] Captura automática de leads/citas (nombre, servicio, fecha, hora preferida) sin menús manuales
- [x] Detección de mensajes urgentes (dolor, sangrado, emergencia) con notificación prioritaria inmediata al negocio
- [x] Detección de quejas y cancelaciones, con tono adaptado y marcado en el lead
- [x] Mensajes de bienvenida y reactivación de conversaciones inactivas (+60 min)
- [x] Notificación automática por WhatsApp al negocio de cada cita nueva
- [x] Resumen diario automático (20:00) con mensajes recibidos, leads nuevos, confirmadas y pendientes
- [x] Dashboard web para gestionar leads: búsqueda, filtro por estado, cambio de estado, orden por columna
- [x] Backup horario automático de los datos + recuperación ante archivo corrupto
- [x] Verificación de firma del webhook (HMAC), rate limiting y cabeceras de seguridad (Helmet)
- [x] Health check (`/health`) con métricas de uptime y tiempo medio de respuesta, listo para monitoring externo
- [x] Script de onboarding interactivo (`npm run onboard`) para dar de alta negocios nuevos sin tocar código
- [x] Test de humo automatizado de los endpoints críticos

---

## Qué necesita el negocio para empezar (requisitos)

1. **Cuenta de Meta Business verificada** con un número de WhatsApp Business dado de alta en Cloud API (no WhatsApp Business App normal — es la API oficial).
2. **API key de Anthropic** (console.anthropic.com) — el uso de Claude tiene coste variable por token, facturado por Anthropic directamente o repercutido según el acuerdo comercial.
3. **Cuenta de hosting** (Railway u otro compatible con Node.js) para desplegar el servidor.
4. **Datos del negocio**: lista de servicios con precios/duraciones, horario de atención, dirección, teléfono de contacto y un número de WhatsApp donde recibir las notificaciones de nuevas citas.
5. **Un número de teléfono para recibir notificaciones** (puede ser el mismo del negocio o uno interno del equipo).
6. Opcional: dominio propio si se quiere el dashboard bajo una URL personalizada.

No se requiere conocimiento técnico del negocio para el día a día: el onboarding inicial (alta del negocio, credenciales) lo hace quien despliega el bot; el uso diario es solo WhatsApp + el dashboard.

---

## SLA y limitaciones honestas

Este producto no ofrece un SLA formal de disponibilidad garantizada. La disponibilidad real depende de tres proveedores independientes fuera de nuestro control: **Meta** (WhatsApp Cloud API), **Anthropic** (Claude) y el **proveedor de hosting** (Railway u otro). Si cualquiera de ellos tiene una incidencia, el bot se ve afectado.

Limitaciones técnicas actuales, sin rodeos:

- **Persistencia en JSON, no en base de datos.** Adecuado para volumen pequeño/medio (cientos de leads por negocio). Con mucho volumen o muchos negocios simultáneos, migrar a una base de datos real (Postgres/similar) es recomendable — la capa de acceso a datos (`leadManager.ts`) está aislada precisamente para facilitar esa migración sin reescribir el resto del sistema.
- **Instancia única.** El sistema no está diseñado para correr en múltiples instancias en paralelo (el fichero de leads no soporta escritura concurrente entre procesos distintos). Railway puede reiniciar la instancia sin problema, pero no se debe escalar horizontalmente sin antes migrar la persistencia.
- **Historial de conversación en memoria.** Si el proceso se reinicia, el hilo de conversación activo se pierde (Claude tratará el siguiente mensaje del cliente como si fuera nuevo). Los leads y citas ya guardados **no** se pierden — eso sí persiste en disco.
- **Claude no es determinista al 100%.** Es un modelo de lenguaje, no una máquina de estados: en casos límite puede interpretar mal un dato o no extraerlo a la primera. Por diseño, nunca inventa precios ni disponibilidad, y ante duda ofrece que un humano contacte al cliente — pero no hay garantía absoluta de cero errores conversacionales.
- **Sin autenticación multiusuario en el dashboard.** El acceso se protege con una única clave interna compartida (`INTERNAL_API_KEY`), no con cuentas individuales por empleado ni roles/permisos.
- **Coste variable no incluido en el hosting.** Cada mensaje respondido por Claude tiene un coste por tokens; cada conversación de WhatsApp fuera de la ventana de 24h gratuita puede tener coste según las tarifas de Meta en cada país.
- **Fuera de alcance actualmente** (no incluido, pero técnicamente viable como ampliación): cobros/pagos integrados, sincronización con Google Calendar/Outlook, recordatorios automáticos previos a la cita, envío de imágenes/catálogos multimedia, soporte de voz/notas de audio.

---

## Preguntas frecuentes técnicas

**¿Qué pasa si Anthropic o Claude fallan?**
El bot responde un mensaje de fallback ("en breve te contactamos") en vez de romperse o dejar al cliente sin respuesta. El fallo queda registrado en los logs.

**¿Dónde y cómo se guardan los datos de los clientes?**
En un fichero JSON en el servidor (con backup horario automático), no en un servicio de terceros de almacenamiento. El texto de la conversación se envía a Anthropic (para generar la respuesta) y a Meta (para transportar el mensaje de WhatsApp) — son los únicos terceros que procesan esos datos.

**¿Puedo gestionar varios negocios con un solo despliegue?**
Sí. Cada número de WhatsApp (`phoneNumberId`) se asocia a un negocio con su propio contexto, servicios, horario y leads, todo aislado entre negocios.

**¿Qué pasa si el servidor se reinicia (deploy, caída, etc.)?**
Los leads y citas ya capturados persisten sin problema. El hilo de conversación en curso con cada cliente se reinicia (Claude no recordará el contexto exacto de esa conversación puntual, aunque si el cliente vuelve a escribir, Claude puede seguir ayudando desde cero con normalidad).

**¿Cómo se da de alta un negocio nuevo?**
Con `npm run onboard` (CLI interactivo que pide todos los datos y los guarda automáticamente), o editando directamente `src/config/businesses.ts`. Ver `examples/business-config-example.json` como plantilla comentada.

**¿Se puede cambiar el modelo de IA usado?**
Sí, es una única constante (`CHAT_MODEL` en `src/services/anthropicClient.ts`).

**¿Esto escala a muchos negocios o mucho volumen de mensajes?**
Para un negocio o una cartera pequeña, sí, tal cual. Para volumen alto (miles de leads, decenas de negocios, alta concurrencia) recomendamos migrar la persistencia a una base de datos real antes de escalar — es un cambio acotado gracias a como está aislada la capa de datos.

**¿Qué coste variable tiene además del hosting?**
El uso de la API de Claude (por token, según el modelo elegido) y, según el país y volumen, el coste de conversaciones de WhatsApp Cloud API fuera de la ventana gratuita de Meta.

**¿Qué pasa si llega un mensaje que no es texto (imagen, audio, ubicación)?**
Actualmente el bot solo procesa mensajes de texto. Otros tipos se reciben pero no generan respuesta automática — es una ampliación posible, no incluida en el alcance actual.
