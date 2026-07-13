import { Router } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { handleIncomingMessages } from '../controllers/messageController';
import { WhatsAppWebhookPayload } from '../types/webhook';
import { verifyMetaSignature } from '../middleware/verifyMetaSignature';

export const webhookRouter = Router();

/** Verificacion inicial del webhook exigida por Meta al configurar la app */
webhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.verifyToken) {
    logger.info('Webhook verificado correctamente por Meta');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('Intento de verificacion de webhook fallido');
  res.sendStatus(403);
});

/** Recepcion de eventos de mensajes en tiempo real. Firma verificada antes de aceptar el body. */
webhookRouter.post('/', verifyMetaSignature, async (req, res) => {
  // Responder 200 de inmediato: si Meta no recibe 200 reintenta y puede generar bucles.
  // Cualquier fallo interno se registra pero nunca se propaga a la respuesta.
  res.sendStatus(200);

  try {
    await handleIncomingMessages(req.body as WhatsAppWebhookPayload);
  } catch (error) {
    logger.error({ error }, 'Error procesando el webhook');
  }
});
