interface DailyCount {
  date: string; // YYYY-MM-DD, hora local del servidor
  count: number;
}

// Contador en memoria: se reinicia solo (compara la fecha) y al reiniciar el proceso.
// Suficiente para la metrica "mensajes hoy" del dashboard.
const counts = new Map<string, DailyCount>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Registra un mensaje entrante de un cliente para las metricas del dashboard */
export function recordIncomingMessage(businessId: string): void {
  const today = todayKey();
  const current = counts.get(businessId);

  if (!current || current.date !== today) {
    counts.set(businessId, { date: today, count: 1 });
    return;
  }

  current.count += 1;
}

/** Devuelve cuantos mensajes entrantes ha recibido el negocio hoy */
export function getTodayMessageCount(businessId: string): number {
  const current = counts.get(businessId);
  if (!current || current.date !== todayKey()) return 0;
  return current.count;
}
