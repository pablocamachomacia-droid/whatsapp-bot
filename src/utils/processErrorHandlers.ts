import { logger } from './logger';

/**
 * Captura errores no controlados a nivel de proceso para que queden registrados
 * en vez de tumbar el servidor de forma silenciosa (o con un stack trace crudo en stdout).
 */
export function registerProcessErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    logger.error(
      { error: error.message, stack: error.stack, timestamp: new Date().toISOString() },
      'uncaughtException: excepcion no capturada'
    );
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? { message: reason.message, stack: reason.stack } : { reason };
    logger.error({ ...error, timestamp: new Date().toISOString() }, 'unhandledRejection: promesa rechazada sin manejar');
  });
}
