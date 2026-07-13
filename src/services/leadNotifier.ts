import { Business } from '../types/business';
import { Lead } from '../types/appointment';
import { sendTextMessage } from './whatsapp';
import { logger } from '../utils/logger';

/** Envia al negocio un WhatsApp con el resumen de una cita/lead recien capturado */
export async function notifyBusinessOfNewLead(business: Business, lead: Lead): Promise<void> {
  const destination = business.notificationPhone ?? business.phone.replace(/\D/g, '');

  if (!business.notificationPhone) {
    logger.warn(
      { businessId: business.id },
      'notificationPhone no configurado; usando business.phone como destino de la notificacion'
    );
  }

  const summary = [
    '📅 Nueva cita solicitada',
    `Cliente: ${lead.name ?? 'sin nombre'} (${lead.phone})`,
    `Servicio: ${lead.service ?? 'no especificado'}`,
    `Fecha preferida: ${lead.preferredDate ?? 'no especificada'}${lead.preferredTime ? ` a las ${lead.preferredTime}` : ''}`,
    lead.contactPhone ? `Telefono de contacto alternativo: ${lead.contactPhone}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  await sendTextMessage(destination, summary);
}

/** Notificacion prioritaria e inmediata al negocio cuando se detecta un mensaje urgente */
export async function notifyBusinessOfUrgentMessage(business: Business, phone: string, message: string): Promise<void> {
  const destination = business.notificationPhone ?? business.phone.replace(/\D/g, '');

  const summary = ['🚨 Mensaje URGENTE de un cliente', `Telefono: ${phone}`, `Mensaje: "${message}"`, 'Responde lo antes posible.'].join(
    '\n'
  );

  await sendTextMessage(destination, summary);
}
