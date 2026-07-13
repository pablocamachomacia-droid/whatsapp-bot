import { BusinessScheduleEntry } from '../types/business';

// Indices alineados con Date.getDay() (0 = domingo ... 6 = sabado)
const DAY_ALIASES: Record<string, number> = {
  domingo: 0, dom: 0, sunday: 0, sun: 0,
  lunes: 1, lun: 1, monday: 1, mon: 1,
  martes: 2, mar: 2, tuesday: 2, tue: 2, tues: 2,
  miercoles: 3, mier: 3, mie: 3, wednesday: 3, wed: 3,
  jueves: 4, jue: 4, thursday: 4, thu: 4, thur: 4, thurs: 4,
  viernes: 5, vie: 5, friday: 5, fri: 5,
  sabado: 6, sab: 6, saturday: 6, sat: 6,
};

function normalize(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (miércoles -> miercoles)
    .trim()
    .toLowerCase();
}

/** Convierte un campo "day" (ej. "Lunes-Viernes", "Sabado", "Lunes,Miercoles") en los indices de dia que cubre */
function resolveDayIndices(dayField: string): Set<number> {
  const indices = new Set<number>();

  for (const part of dayField.split(',')) {
    const tokens = part
      .split('-')
      .map((token) => normalize(token))
      .filter(Boolean);

    if (tokens.length === 2) {
      const start = DAY_ALIASES[tokens[0]];
      const end = DAY_ALIASES[tokens[1]];
      if (start === undefined || end === undefined) continue;

      let day = start;
      // recorre en orden circular desde start hasta end (soporta rangos tipo Viernes-Lunes)
      while (true) {
        indices.add(day);
        if (day === end) break;
        day = (day + 1) % 7;
      }
    } else {
      for (const token of tokens) {
        const index = DAY_ALIASES[token];
        if (index !== undefined) indices.add(index);
      }
    }
  }

  return indices;
}

function parseTimeToMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** Comprueba si el minuto actual cae dentro de alguno de los rangos horarios (soporta turno partido: "09:00-14:00,16:00-20:00") */
function isWithinHours(hoursField: string, minutesNow: number): boolean {
  return hoursField.split(',').some((range) => {
    const [start, end] = range.split('-');
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    if (startMinutes === null || endMinutes === null) return false;
    return minutesNow >= startMinutes && minutesNow <= endMinutes;
  });
}

/** Determina si el negocio esta abierto ahora mismo segun su horario. Usa la hora local del servidor. */
export function isBusinessHours(schedule: BusinessScheduleEntry[], now: Date = new Date()): boolean {
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return schedule.some((entry) => {
    const days = resolveDayIndices(entry.day);
    return days.has(currentDay) && isWithinHours(entry.hours, currentMinutes);
  });
}
