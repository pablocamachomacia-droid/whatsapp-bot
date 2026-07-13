import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/** Middleware de error global de Express. Debe registrarse el ultimo, tras todas las rutas. */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error(
    { error: err.message, stack: err.stack, path: req.path, method: req.method, timestamp: new Date().toISOString() },
    'Error no controlado en una peticion'
  );

  if (res.headersSent) {
    return;
  }

  // El webhook de Meta SIEMPRE debe recibir 200, incluso si el error ocurrio antes de
  // llegar a la ruta (ej. JSON malformado en express.json()) — si no, Meta reintenta
  // el mismo payload y puede generar un bucle de reintentos.
  if (req.path.startsWith('/webhook')) {
    res.sendStatus(200);
    return;
  }

  res.status(500).json({ error: 'Error interno del servidor' });
}
