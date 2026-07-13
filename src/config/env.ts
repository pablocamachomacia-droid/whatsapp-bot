import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

/** Valida PORT si esta definido: falla en el arranque en vez de producir un NaN silencioso */
function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Variable de entorno PORT invalida: "${value}". Debe ser un numero entero positivo.`);
  }
  return parsed;
}

export const env = {
  port: parsePort(process.env.PORT, 3000),
  verifyToken: required('WHATSAPP_VERIFY_TOKEN'),
  accessToken: required('WHATSAPP_ACCESS_TOKEN'),
  phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
  apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
  // Secreto de la app de Meta, usado para verificar la firma X-Hub-Signature-256 del webhook
  appSecret: required('APP_SECRET'),
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  internalApiKey: required('INTERNAL_API_KEY'),
  // Carpeta donde se persisten los datos (leads.json + backup). En Railway, monta un
  // Volume y apunta DATA_PATH a su ruta para que sobreviva a los redeploys.
  dataPath: process.env.DATA_PATH ? path.resolve(process.env.DATA_PATH) : path.join(process.cwd(), 'data'),
};
