import rateLimit from 'express-rate-limit';

/** Limite para el webhook de Meta: 100 peticiones/minuto por IP */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones al webhook. Intenta de nuevo en un minuto.' },
});

/** Limite para endpoints internos (/leads, /api/dashboard): 30 peticiones/minuto por IP */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' },
});
