import cron from 'node-cron';
import { Business } from '../types/business';
import { getAllBusinesses } from '../config/businesses';
import { getTodayMessageCount } from './messageStats';
import { getDailyLeadStats, DailyLeadStats } from './leadManager';
import { sendTextMessage } from './whatsapp';
import { logger } from '../utils/logger';

function buildDailySummaryMessage(business: Business, messagesToday: number, stats: DailyLeadStats): string {
  const lines = [
    `📊 Resumen del día — ${business.name}`,
    `💬 Mensajes recibidos: ${messagesToday}`,
    `👥 Leads nuevos: ${stats.newLeadsToday}`,
    `✅ Citas confirmadas: ${stats.confirmedTotal}`,
    `⏳ Pendientes de contactar: ${stats.pendingContact.length}`,
  ];

  if (stats.pendingContact.length > 0) {
    lines.push('');
    for (const lead of stats.pendingContact) {
      lines.push(`- ${lead.name ?? 'Sin nombre'} (${lead.phone})`);
    }
  }

  return lines.join('\n');
}

async function sendDailySummaryForBusiness(business: Business): Promise<void> {
  const destination = business.notificationPhone ?? business.phone.replace(/\D/g, '');
  const messagesToday = getTodayMessageCount(business.id);
  const stats = getDailyLeadStats(business.id);
  const message = buildDailySummaryMessage(business, messagesToday, stats);

  try {
    await sendTextMessage(destination, message);
    logger.info({ businessId: business.id }, 'Resumen diario enviado');
  } catch (error) {
    logger.error({ error, businessId: business.id }, 'Error enviando el resumen diario');
  }
}

/** Programa el envio del resumen diario a las 20:00 (hora local del servidor) para cada negocio configurado */
export function startDailySummarySchedule(): void {
  cron.schedule('0 20 * * *', async () => {
    logger.info('Generando resumenes diarios de todos los negocios');

    // Secuencial (no Promise.all) a proposito: evita una rafaga de envios concurrentes
    // a la API de WhatsApp si en el futuro hay muchos negocios configurados.
    for (const business of getAllBusinesses()) {
      await sendDailySummaryForBusiness(business);
    }
  });
}
