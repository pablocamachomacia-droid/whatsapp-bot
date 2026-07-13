import { WhatsAppWebhookPayload } from '../types/webhook';
import { Business } from '../types/business';
import { logger } from '../utils/logger';
import { markAsRead, sendTextMessage } from '../services/whatsapp';
import { generateResponse } from '../services/claude';
import {
  getHistory,
  addMessage,
  isNewConversation,
  isInactiveConversation,
} from '../services/conversationManager';
import { getBusinessByPhoneNumberId } from '../config/businesses';
import { extractAppointmentData } from '../utils/extractAppointmentData';
import { detectCriticalIntent, CriticalIntent } from '../utils/detectCriticalIntent';
import { findLead, saveLead } from '../services/leadManager';
import { notifyBusinessOfNewLead, notifyBusinessOfUrgentMessage } from '../services/leadNotifier';
import { recordIncomingMessage } from '../services/messageStats';

const INACTIVITY_THRESHOLD_MINUTES = 60;

/** Punto unico de entrada para procesar mensajes entrantes del webhook */
export async function handleIncomingMessages(payload: WhatsAppWebhookPayload): Promise<void> {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const messages = value?.messages;

  if (!messages || messages.length === 0) {
    return;
  }

  const phoneNumberId = value.metadata.phone_number_id;
  const business = getBusinessByPhoneNumberId(phoneNumberId);

  if (!business) {
    logger.error({ phoneNumberId }, 'Mensaje recibido para un phoneNumberId sin negocio configurado');
    return;
  }

  for (const message of messages) {
    // Cada mensaje se procesa de forma aislada: si uno falla, no debe impedir que se
    // procesen el resto de mensajes del mismo lote del webhook.
    try {
      logger.info({ from: message.from, type: message.type, businessId: business.id }, 'Mensaje entrante');
      recordIncomingMessage(business.id);
      await markAsRead(message.id);

      if (message.type === 'text' && message.text) {
        await routeTextMessage(message.from, message.text.body, business);
      }
    } catch (error) {
      logger.error({ error, from: message.from, businessId: business.id }, 'Error procesando un mensaje del lote');
    }
  }
}

/** Claude gestiona todo el flujo conversacional: recepcion, contexto de negocio, historial y captura de citas */
async function routeTextMessage(from: string, text: string, business: Business): Promise<void> {
  const isNew = isNewConversation(from);
  const isInactive = !isNew && isInactiveConversation(from, INACTIVITY_THRESHOLD_MINUTES);
  const intent = detectCriticalIntent(text);

  const history = getHistory(from);
  const reply = await generateResponse(text, history, business, {
    isNewConversation: isNew,
    isInactiveConversation: isInactive,
    intent,
  });

  addMessage(from, 'user', text);
  addMessage(from, 'assistant', reply);

  try {
    await sendTextMessage(from, reply);
  } catch (error) {
    logger.error({ error, businessId: business.id }, 'Error enviando la respuesta al cliente');
    // No relanzamos: aunque falle el envio, seguimos con la deteccion de intencion y
    // la captura de citas — son criticas para el negocio y no dependen de que este
    // mensaje concreto haya llegado al cliente.
  }

  if (intent === 'urgent') {
    try {
      await notifyBusinessOfUrgentMessage(business, from, text);
    } catch (error) {
      logger.error({ error, businessId: business.id }, 'Error notificando mensaje urgente al negocio');
    }
  }

  if (intent !== 'normal') {
    try {
      flagLeadIntent(business, from, intent);
    } catch (error) {
      logger.error({ error, businessId: business.id }, 'Error marcando la intencion critica en el lead');
    }
  }

  await checkForCompletedAppointment(from, business);
}

/** Marca la intencion critica detectada en el lead del cliente, creando uno minimo si aun no existia */
function flagLeadIntent(business: Business, phone: string, intent: Exclude<CriticalIntent, 'normal'>): void {
  const existing = findLead(business.id, phone);

  saveLead({
    businessId: business.id,
    phone,
    status: existing?.status ?? 'new',
    intent,
  });
}

/** Analiza el historial actualizado; si hay una cita con todos los datos, guarda el lead y notifica una unica vez */
async function checkForCompletedAppointment(from: string, business: Business): Promise<void> {
  const fullHistory = getHistory(from);
  const extraction = await extractAppointmentData(fullHistory);

  if (!extraction || !extraction.isComplete) {
    return;
  }

  // Un lead "bare" (creado solo por flagLeadIntent, sin servicio/fecha) no cuenta como cita
  // ya confirmada: solo saltamos la notificacion si YA se habia completado la cita antes.
  const existingLead = findLead(business.id, from);
  const appointmentAlreadyConfirmed = existingLead != null && Boolean(existingLead.service && existingLead.preferredDate);

  let lead;
  try {
    lead = saveLead({
      businessId: business.id,
      phone: from,
      name: extraction.name ?? undefined,
      service: extraction.service ?? undefined,
      preferredDate: extraction.preferredDate ?? undefined,
      preferredTime: extraction.preferredTime ?? undefined,
      contactPhone: extraction.contactPhone ?? undefined,
      status: existingLead?.status ?? 'new',
    });
  } catch (error) {
    logger.error({ error, businessId: business.id }, 'Error guardando el lead con los datos de la cita');
    return;
  }

  if (appointmentAlreadyConfirmed) {
    return;
  }

  const confirmation = [
    `✅ ¡Listo${lead.name ? `, ${lead.name}` : ''}! Cita registrada:`,
    `🗓️ ${lead.service} — ${lead.preferredDate}${lead.preferredTime ? ` a las ${lead.preferredTime}` : ''}`,
    'Te confirmaremos disponibilidad en breve.',
  ].join('\n');

  addMessage(from, 'assistant', confirmation);

  try {
    await sendTextMessage(from, confirmation);
  } catch (error) {
    logger.error({ error, businessId: business.id }, 'Error enviando la confirmacion de cita al cliente');
  }

  try {
    await notifyBusinessOfNewLead(business, lead);
  } catch (error) {
    logger.error({ error, businessId: business.id }, 'Error notificando la nueva cita al negocio');
  }
}
