import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const graphUrl = `https://graph.facebook.com/${env.apiVersion}/${env.phoneNumberId}/messages`;

const client = axios.create({
  baseURL: graphUrl,
  headers: {
    Authorization: `Bearer ${env.accessToken}`,
    'Content-Type': 'application/json',
  },
});

/** Envia un mensaje de texto simple a un numero en formato E.164 sin '+' (ej. 34600111222) */
export async function sendTextMessage(to: string, body: string): Promise<void> {
  try {
    await client.post('', {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
    logger.info({ to }, 'Mensaje enviado');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ to, data: error.response?.data }, 'Error enviando mensaje de WhatsApp');
    } else {
      logger.error({ to, error }, 'Error inesperado enviando mensaje');
    }
    throw error;
  }
}

/** Marca un mensaje entrante como leido (doble check azul) */
export async function markAsRead(messageId: string): Promise<void> {
  try {
    await client.post('', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  } catch (error) {
    logger.warn({ messageId, error }, 'No se pudo marcar el mensaje como leido');
  }
}
