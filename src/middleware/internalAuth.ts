import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/** Middleware que exige el header 'x-api-key' con la clave interna configurada */
export function requireInternalApiKey(req: Request, res: Response, next: NextFunction): void {
  const providedKey = req.header('x-api-key');

  if (providedKey !== env.internalApiKey) {
    res.sendStatus(401);
    return;
  }

  next();
}
