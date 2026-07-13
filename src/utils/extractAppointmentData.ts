import { anthropicClient, CHAT_MODEL } from '../services/anthropicClient';
import { ConversationMessage } from '../services/conversationManager';
import { logger } from './logger';

export interface AppointmentExtraction {
  name: string | null;
  service: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  /** Telefono de contacto alternativo, solo si el cliente menciono explicitamente uno distinto al suyo */
  contactPhone: string | null;
  isComplete: boolean;
}

interface RawExtraction {
  hasIntent: boolean;
  name: string | null;
  service: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  contactPhone: string | null;
}

const EXTRACTION_SYSTEM_PROMPT = `Analiza la siguiente conversacion entre un cliente y la recepcionista virtual de un negocio. Tu unica tarea es detectar si el cliente esta intentando pedir una cita o reservar un servicio, y extraer los datos disponibles.

Responde EXCLUSIVAMENTE con un objeto JSON, sin texto adicional, sin markdown y sin explicaciones, con esta forma exacta:
{"hasIntent": boolean, "name": string|null, "service": string|null, "preferredDate": string|null, "preferredTime": string|null, "contactPhone": string|null}

Reglas:
- "hasIntent" es true solo si el cliente ha mostrado intencion real de agendar o reservar algo (no simples preguntas de precio, horario o informacion general).
- Usa null en cualquier campo que no se mencione explicitamente en la conversacion. No inventes ni infieras datos.
- "preferredDate" y "preferredTime" deben reflejar tal cual lo dijo el cliente (ej. "mañana", "el viernes", "por la tarde"), sin convertirlo a un formato de fecha.
- "contactPhone" es un numero de telefono SOLO si el cliente proporciono explicitamente uno distinto al que esta usando para escribir (ej. "llamadme al 600111222"). Si no menciona ningun numero alternativo, usa null.
- No incluyas ningun texto fuera del objeto JSON.`;

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

/** Analiza el historial con Claude para detectar y extraer datos de una cita. Devuelve null si no hay intencion de cita. */
export async function extractAppointmentData(
  conversationHistory: ConversationMessage[]
): Promise<AppointmentExtraction | null> {
  if (conversationHistory.length === 0) return null;

  const transcript = conversationHistory
    .map((message) => `${message.role === 'user' ? 'Cliente' : 'Recepcionista'}: ${message.content}`)
    .join('\n');

  try {
    const response = await anthropicClient.messages.create({
      model: CHAT_MODEL,
      max_tokens: 300,
      system: EXTRACTION_SYSTEM_PROMPT,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: transcript }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (textBlock?.type !== 'text') return null;

    const parsed = JSON.parse(stripCodeFences(textBlock.text)) as RawExtraction;
    if (!parsed.hasIntent) return null;

    const isComplete = Boolean(parsed.name && parsed.service && parsed.preferredDate);

    return {
      name: parsed.name,
      service: parsed.service,
      preferredDate: parsed.preferredDate,
      preferredTime: parsed.preferredTime,
      contactPhone: parsed.contactPhone,
      isComplete,
    };
  } catch (error) {
    logger.error({ error }, 'Error extrayendo datos de cita con Claude');
    return null;
  }
}
