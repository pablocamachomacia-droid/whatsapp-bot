import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Lead, LeadStatus } from '../types/appointment';
import { logger } from '../utils/logger';
import { env } from '../config/env';

const DATA_DIR = env.dataPath;
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const BACKUP_FILE = path.join(DATA_DIR, 'leads.backup.json');

function ensureStoreExists(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, '[]', 'utf-8');
  }
}

/** Lee y parsea un JSON de leads. Devuelve null si no existe, esta corrupto o no es un array. */
function readJsonFile(filePath: string): Lead[] | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return (parsed as Lead[]).map((lead) => ({
      ...lead,
      createdAt: new Date(lead.createdAt),
      // Fallback a createdAt para leads guardados antes de añadir estos campos
      firstContactAt: new Date(lead.firstContactAt ?? lead.createdAt),
      lastMessageAt: new Date(lead.lastMessageAt ?? lead.createdAt),
    }));
  } catch {
    return null;
  }
}

// Lecturas y escrituras usan fs sincrono a proposito: dentro de una misma llamada a
// saveLead/updateLeadStatus no hay ningun await entre leer y escribir, asi que Node no
// puede intercalar otra peticion en medio de ESE read-modify-write concreto (JS es
// single-threaded). Limite conocido: dos mensajes casi simultaneos del MISMO cliente,
// cada uno con su propio await a Claude antes de llegar a su saveLead, podrian aplicar
// un "last write wins" si se entrelazan en distinto orden — aceptable para este volumen;
// migrar a una base de datos con locking/transacciones reales si esto escala mucho.
function readLeads(): Lead[] {
  ensureStoreExists();

  const fromMain = readJsonFile(LEADS_FILE);
  if (fromMain) return fromMain;

  logger.error({ file: LEADS_FILE }, 'leads.json corrupto o ilegible; intentando restaurar desde backup');

  const fromBackup = readJsonFile(BACKUP_FILE);
  if (fromBackup) {
    logger.warn({ file: BACKUP_FILE }, 'Restaurado leads.json desde el backup');
    writeLeads(fromBackup);
    return fromBackup;
  }

  logger.error('No se pudo restaurar leads desde el backup; se continua con una lista vacia');
  return [];
}

// Escritura atomica: se escribe primero a un archivo temporal unico y se renombra encima
// del definitivo. rename() es atomico a nivel de sistema de archivos, asi que un crash o
// kill del proceso a mitad de escritura nunca deja leads.json truncado o corrupto: los
// lectores siempre ven la version anterior completa o la nueva completa, nunca algo intermedio.
function writeLeads(leads: Lead[]): void {
  const tempFile = path.join(DATA_DIR, `.leads.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, JSON.stringify(leads, null, 2), 'utf-8');
  fs.renameSync(tempFile, LEADS_FILE);
}

/** Copia leads.json a leads.backup.json. No sobreescribe el backup si el archivo principal esta corrupto. */
export function backupLeads(): void {
  ensureStoreExists();

  const valid = readJsonFile(LEADS_FILE);
  if (!valid) {
    logger.error('Backup de leads omitido: leads.json esta corrupto en este momento');
    return;
  }

  fs.copyFileSync(LEADS_FILE, BACKUP_FILE);
  logger.info({ file: BACKUP_FILE }, 'Backup de leads generado');
}

let backupTimer: NodeJS.Timeout | null = null;

/** Genera un backup inicial y programa backups periodicos (cada hora por defecto) */
export function startLeadBackupSchedule(intervalMs = 60 * 60 * 1000): void {
  backupLeads();

  if (backupTimer) {
    clearInterval(backupTimer);
  }
  backupTimer = setInterval(backupLeads, intervalMs);
}

/** Numero total de leads almacenados, de todos los negocios (para el health check) */
export function getAllLeadsCount(): number {
  return readLeads().length;
}

type SaveLeadInput = Omit<Lead, 'id' | 'createdAt' | 'firstContactAt' | 'lastMessageAt'> &
  Partial<Pick<Lead, 'id' | 'createdAt'>>;

/**
 * Guarda un lead nuevo o actualiza el existente para el mismo telefono+negocio.
 * firstContactAt/lastMessageAt se gestionan automaticamente: firstContactAt se fija
 * una unica vez al crear el lead; lastMessageAt se actualiza en cada guardado.
 */
export function saveLead(lead: SaveLeadInput): Lead {
  const leads = readLeads();
  const now = new Date();
  const existingIndex = leads.findIndex((l) => l.phone === lead.phone && l.businessId === lead.businessId);

  if (existingIndex !== -1) {
    const updated: Lead = { ...leads[existingIndex], ...lead, lastMessageAt: now };
    leads[existingIndex] = updated;
    writeLeads(leads);
    logger.info({ leadId: updated.id, businessId: updated.businessId }, 'Lead actualizado');
    return updated;
  }

  const newLead: Lead = {
    id: crypto.randomUUID(),
    createdAt: now,
    firstContactAt: now,
    lastMessageAt: now,
    ...lead,
  };
  leads.push(newLead);
  writeLeads(leads);
  logger.info({ leadId: newLead.id, businessId: newLead.businessId }, 'Lead creado');
  return newLead;
}

/** Busca un lead existente por negocio+telefono, sin crear nada */
export function findLead(businessId: string, phone: string): Lead | null {
  return readLeads().find((lead) => lead.businessId === businessId && lead.phone === phone) ?? null;
}

/** Devuelve todos los leads de un negocio, mas recientes primero */
export function getLeads(businessId: string): Lead[] {
  return readLeads()
    .filter((lead) => lead.businessId === businessId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Actualiza el estado de un lead por id. Devuelve el lead actualizado o null si no existe */
export function updateLeadStatus(id: string, status: LeadStatus): Lead | null {
  const leads = readLeads();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) return null;

  leads[index] = { ...leads[index], status };
  writeLeads(leads);
  return leads[index];
}

export interface LeadStats {
  totalLeads: number;
  confirmed: number;
  pending: number;
  conversionRate: number;
}

/**
 * Metricas del mes en curso para el dashboard.
 * "pending" agrupa new+contacted (aun no cerrados); conversionRate = confirmed/totalLeads.
 */
export function getMonthlyStats(businessId: string): LeadStats {
  const now = new Date();
  const leadsThisMonth = getLeads(businessId).filter(
    (lead) => lead.createdAt.getFullYear() === now.getFullYear() && lead.createdAt.getMonth() === now.getMonth()
  );

  const totalLeads = leadsThisMonth.length;
  const confirmed = leadsThisMonth.filter((lead) => lead.status === 'confirmed').length;
  const pending = leadsThisMonth.filter((lead) => lead.status === 'new' || lead.status === 'contacted').length;
  const conversionRate = totalLeads > 0 ? Math.round((confirmed / totalLeads) * 100) : 0;

  return { totalLeads, confirmed, pending, conversionRate };
}

export interface DailyLeadStats {
  newLeadsToday: number;
  confirmedTotal: number;
  pendingContact: Lead[];
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Metricas para el resumen diario. "confirmedTotal" es una foto del total confirmado
 * actual (no solo el de hoy: no tenemos un timestamp de "confirmado en"). "pendingContact"
 * es la cola completa de leads sin cerrar (new/contacted), no solo los de hoy.
 */
export function getDailyLeadStats(businessId: string): DailyLeadStats {
  const leads = getLeads(businessId);
  const today = new Date();

  const newLeadsToday = leads.filter((lead) => isSameCalendarDay(lead.createdAt, today)).length;
  const confirmedTotal = leads.filter((lead) => lead.status === 'confirmed').length;
  const pendingContact = leads.filter((lead) => lead.status === 'new' || lead.status === 'contacted');

  return { newLeadsToday, confirmedTotal, pendingContact };
}
