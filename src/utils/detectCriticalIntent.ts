export type CriticalIntent = 'normal' | 'urgent' | 'complaint' | 'cancellation';

interface IntentRule {
  intent: Exclude<CriticalIntent, 'normal'>;
  patterns: RegExp[];
}

// Orden = prioridad: si un mensaje coincide con varias reglas, gana la primera de la lista
// (una queja sobre dolor, por ejemplo, se trata como urgencia, no como queja).
const RULES: IntentRule[] = [
  {
    intent: 'urgent',
    patterns: [/\burgen(te|cia)\b/, /\bdolor\b/, /\bemergencia\b/, /\bsangr(ado|ando|e)\b/],
  },
  {
    intent: 'complaint',
    patterns: [/\bmal\b/, /\bpesimo\b/, /\bqueja\b/, /\breclama[rn]?\b/],
  },
  {
    intent: 'cancellation',
    patterns: [/\bcancelar\b/, /\banular\b/, /no puedo ir/, /no podr[ei]a? ir/],
  },
];

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase();
}

/** Detecta intencion critica en el mensaje del cliente via keywords/regex, antes de llamar a Claude */
export function detectCriticalIntent(text: string): CriticalIntent {
  const normalized = normalizeText(text);

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.intent;
    }
  }

  return 'normal';
}
