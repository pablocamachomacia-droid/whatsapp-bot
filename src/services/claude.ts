import { logger } from '../utils/logger';
import { ConversationMessage } from './conversationManager';
import { Business } from '../types/business';
import { isBusinessHours } from '../utils/businessHours';
import { anthropicClient, CHAT_MODEL } from './anthropicClient';
import { CriticalIntent } from '../utils/detectCriticalIntent';
import { recordResponseTime } from './responseTimeStats';

const FALLBACK_MESSAGE =
  'Disculpa, en este momento no puedo responder. Un miembro de nuestro equipo te contactara en breve.';

export interface ConversationContext {
  isNewConversation: boolean;
  isInactiveConversation: boolean;
  intent: CriticalIntent;
}

function formatServices(business: Business): string {
  return business.services
    .map((service) => {
      const details = [service.price, service.duration].filter(Boolean).join(' / ');
      return details ? `- ${service.name} (${details})` : `- ${service.name}`;
    })
    .join('\n');
}

function formatSchedule(business: Business): string {
  return business.schedule.map((entry) => `- ${entry.day}: ${entry.hours}`).join('\n');
}

/** Fecha de hoy en español, para que Claude pueda razonar sobre "pasado" vs "futuro" al pedir citas */
function formatToday(): string {
  return new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildConversationStateGuidance(context: ConversationContext): string {
  if (context.isNewConversation) {
    return 'Este es el PRIMER mensaje de este cliente en esta conversacion. Saludale con calidez, presentate brevemente como la recepcionista virtual del negocio y pregunta en que puedes ayudarle.';
  }

  if (context.isInactiveConversation) {
    return 'El cliente llevaba mas de 60 minutos sin escribir. Retoma la conversacion con calidez reconociendo que ha pasado un tiempo (ej. "¡Hola de nuevo! Te estaba ayudando con...") apoyandote en el historial. No le hagas repetir lo que ya dijo.';
  }

  return '';
}

function buildIntentGuidance(intent: CriticalIntent): string {
  switch (intent) {
    case 'urgent':
      return 'ALERTA DE URGENCIA: el cliente ha escrito algo que suena a urgencia o emergencia (dolor, sangrado, etc). Respondele con calma pero prioridad maxima, dale una indicacion clara e inmediata si la conoces, y dile explicitamente que ya se ha avisado a alguien del equipo para que le atienda cuanto antes. No le pidas datos de cita en este mensaje: la urgencia va primero.';
    case 'complaint':
      return 'ALERTA DE QUEJA: el cliente esta expresando una queja o insatisfaccion. Respondele con empatia genuina, sin ponerte a la defensiva ni minimizar lo que dice, pidele disculpas si procede, y dile que un responsable del negocio va a revisar su caso personalmente.';
    case 'cancellation':
      return 'El cliente quiere cancelar o no puede acudir a una cita. Confirma la cancelacion con naturalidad, sin insistir, y ofrecele amablemente reagendar para otro dia si le interesa.';
    default:
      return '';
  }
}

function buildSystemPrompt(business: Business, context: ConversationContext): string {
  const open = isBusinessHours(business.schedule);
  const stateGuidance = buildConversationStateGuidance(context);
  const intentGuidance = buildIntentGuidance(context.intent);

  const sections = [
    `Eres la recepcionista virtual de "${business.name}". Hablas por WhatsApp con clientes reales, no eres un chatbot de soporte generico.`,
    `FECHA DE HOY: ${formatToday()}`,
    `DATOS DEL NEGOCIO\nServicios:\n${formatServices(business)}\n\nHorario:\n${formatSchedule(business)}\n\nDireccion: ${business.address}\nTelefono: ${business.phone}${business.website ? `\nWeb: ${business.website}` : ''}\nEstado ahora mismo: ${open ? 'ABIERTO' : 'CERRADO'}`,
    business.customInstructions ? `INSTRUCCIONES ESPECIFICAS DE ESTE NEGOCIO\n${business.customInstructions}` : '',
    stateGuidance ? `CONTEXTO DE LA CONVERSACION\n${stateGuidance}` : '',
    intentGuidance ? `SITUACION DETECTADA EN EL MENSAJE\n${intentGuidance}` : '',
    `REGLAS DE COMPORTAMIENTO
1. Eres la recepcionista de ${business.name}, no una IA generica. Nunca digas que eres Claude ni un modelo de lenguaje, salvo que el cliente insista explicitamente varias veces — en ese caso, admitelo con naturalidad y sigue ayudando con normalidad.
2. Responde como en un WhatsApp real: mensajes cortos y naturales, maximo 3 lineas por respuesta.
3. Usa emojis con moderacion: como maximo 1-2 por mensaje, nunca mas.
4. Si preguntan un precio y lo tienes en los datos del negocio, dalo directo, sin rodeos.
5. Si el cliente quiere pedir cita, pide estos datos que falten: nombre, servicio deseado y dia preferido (si ya los ha dado, no los repitas).
6. Si no sabes algo con certeza, di que lo vas a consultar y le escribes en breve — nunca inventes precios, disponibilidad ni datos que no tengas.
7. Si el negocio esta CERRADO ahora mismo, avisa amablemente del horario de apertura y dile que le contactaran en cuanto abran.
8. Detecta el idioma en el que te escribe el cliente y responde siempre en ese mismo idioma, aunque estas instrucciones esten en español.
9. Mantén un tono cercano y profesional, nunca robotico ni con frases hechas de atencion al cliente.
10. Si el mensaje es spam, publicidad o irrelevante para el negocio, ignoralo de forma educada con una respuesta breve y neutra, sin seguir esa conversacion.
11. NUNCA aceptes ni confirmes una cita en una fecha que ya haya pasado respecto a la FECHA DE HOY indicada arriba. Si el cliente propone una fecha pasada (o ambigua y podria ser pasada), diselo con amabilidad y pide una fecha futura antes de continuar.
12. Si el cliente da un numero de telefono distinto al que esta usando para escribirte (por ejemplo, "llamadme mejor al 600111222" o "el telefono de contacto es otro"), tratalo como un telefono de contacto alternativo para la cita: confirma que lo has anotado y menciona ese numero en tu respuesta, para que quede reflejado en la conversacion.
13. Al pedir datos de una cita, si tras 3 mensajes tuyos pidiendolos el cliente sigue sin darte todos (nombre, servicio y dia), deja de insistir: ofrecele amablemente que el equipo del negocio le llame para concretarlo, en vez de seguir preguntando.
14. Nunca menciones, compares ni valores a la competencia u otros negocios similares, aunque el cliente pregunte por ellos o compare precios. Redirige la conversacion a lo que puedes ofrecerle tu.`,
  ];

  return sections.filter(Boolean).join('\n\n');
}

/** Genera la respuesta del asistente dado el historial, el negocio y el contexto de la conversacion */
export async function generateResponse(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  business: Business,
  context: ConversationContext
): Promise<string> {
  const startedAt = Date.now();

  try {
    const response = await anthropicClient.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(business, context),
      output_config: { effort: 'low' },
      messages: [
        ...conversationHistory.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: 'user' as const, content: userMessage },
      ],
    });

    recordResponseTime(Date.now() - startedAt);

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : FALLBACK_MESSAGE;
  } catch (error) {
    logger.error({ error, businessId: business.id }, 'Error generando respuesta con Claude');
    return FALLBACK_MESSAGE;
  }
}
