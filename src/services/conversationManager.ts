export type ConversationRole = 'user' | 'assistant';

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  timestamp: number;
}

const MAX_MESSAGES_PER_CONVERSATION = 20;

// Almacenamiento en memoria: se pierde al reiniciar el proceso. Para produccion
// con multiples instancias, sustituir por Redis u otro store compartido.
const conversations = new Map<string, ConversationMessage[]>();

export function getHistory(phone: string): ConversationMessage[] {
  return conversations.get(phone) ?? [];
}

export function addMessage(phone: string, role: ConversationRole, content: string): void {
  const history = conversations.get(phone) ?? [];
  history.push({ role, content, timestamp: Date.now() });

  if (history.length > MAX_MESSAGES_PER_CONVERSATION) {
    history.splice(0, history.length - MAX_MESSAGES_PER_CONVERSATION);
  }

  conversations.set(phone, history);
}

export function clearHistory(phone: string): void {
  conversations.delete(phone);
}

/** true si este cliente no tiene ningun mensaje previo registrado (primer contacto) */
export function isNewConversation(phone: string): boolean {
  const history = conversations.get(phone);
  return !history || history.length === 0;
}

/** true si hay historial y el ultimo mensaje fue hace mas de `minutes` minutos */
export function isInactiveConversation(phone: string, minutes: number): boolean {
  const history = conversations.get(phone);
  if (!history || history.length === 0) return false;

  const lastMessage = history[history.length - 1];
  return Date.now() - lastMessage.timestamp > minutes * 60 * 1000;
}
