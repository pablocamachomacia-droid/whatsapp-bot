import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/** Verifica que la peticion al webhook viene realmente de Meta comprobando X-Hub-Signature-256 */
export function verifyMetaSignature(req: Request, res: Response, next: NextFunction): void {
  const signatureHeader = req.header('x-hub-signature-256');

  if (!signatureHeader || !req.rawBody) {
    logger.warn('Peticion al webhook rechazada: falta la firma X-Hub-Signature-256');
    res.sendStatus(401);
    return;
  }

  const expectedSignature = `sha256=${crypto.createHmac('sha256', env.appSecret).update(req.rawBody).digest('hex')}`;

  const provided = Buffer.from(signatureHeader);
  const expected = Buffer.from(expectedSignature);

  const isValid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

  if (!isValid) {
    logger.warn('Peticion al webhook rechazada: firma X-Hub-Signature-256 invalida');
    res.sendStatus(401);
    return;
  }

  next();
}
