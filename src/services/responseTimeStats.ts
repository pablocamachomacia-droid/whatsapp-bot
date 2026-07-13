const MAX_SAMPLES = 100;
const samples: number[] = [];

/** Registra la duracion (ms) de una llamada a Claude que respondio correctamente */
export function recordResponseTime(durationMs: number): void {
  samples.push(durationMs);
  if (samples.length > MAX_SAMPLES) {
    samples.shift();
  }
}

/** Media (ms) de las ultimas 100 respuestas de Claude registradas. 0 si aun no hay datos. */
export function getAverageResponseTime(): number {
  if (samples.length === 0) return 0;
  const total = samples.reduce((sum, value) => sum + value, 0);
  return Math.round(total / samples.length);
}
