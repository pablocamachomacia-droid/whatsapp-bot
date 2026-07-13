import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Bytes crudos del body, capturados por express.json({ verify }) para validar firmas HMAC */
      rawBody?: Buffer;
    }
  }
}

export {};
