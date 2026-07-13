import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface UptimeState {
  firstStartAt: string; // ISO 8601
  lastHeartbeatAt: string; // ISO 8601
  downtimeMs: number;
}

const STATE_FILE = path.join(env.dataPath, 'uptime-state.json');
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
// Un hueco mayor a esto entre heartbeats se interpreta como caida (crash, redeploy, host reiniciado)
const DOWNTIME_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 3;

function ensureDataDir(): void {
  if (!fs.existsSync(env.dataPath)) {
    fs.mkdirSync(env.dataPath, { recursive: true });
  }
}

function readState(): UptimeState | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw) as UptimeState;
  } catch {
    return null;
  }
}

// Escritura atomica (temp + rename), igual que en leadManager: evita dejar el archivo
// de estado truncado si el proceso muere justo durante la escritura.
function writeState(state: UptimeState): void {
  ensureDataDir();
  const tempFile = path.join(env.dataPath, `.uptime-state.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tempFile, STATE_FILE);
}

let heartbeatTimer: NodeJS.Timeout | null = null;

/** Detecta caidas desde el ultimo arranque (comparando con el ultimo heartbeat) y programa el heartbeat periodico */
export function startUptimeTracking(): void {
  ensureDataDir();
  const now = new Date();
  const previous = readState();

  if (!previous) {
    writeState({ firstStartAt: now.toISOString(), lastHeartbeatAt: now.toISOString(), downtimeMs: 0 });
  } else {
    const gapMs = now.getTime() - new Date(previous.lastHeartbeatAt).getTime();
    const additionalDowntime = gapMs > DOWNTIME_THRESHOLD_MS ? gapMs : 0;

    if (additionalDowntime > 0) {
      logger.warn({ downtimeMs: additionalDowntime }, 'Caida detectada desde el ultimo arranque');
    }

    writeState({
      firstStartAt: previous.firstStartAt,
      lastHeartbeatAt: now.toISOString(),
      downtimeMs: previous.downtimeMs + additionalDowntime,
    });
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  heartbeatTimer = setInterval(() => {
    const state = readState();
    if (state) {
      writeState({ ...state, lastHeartbeatAt: new Date().toISOString() });
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/** % de uptime desde que se empezo a trackear, descontando las caidas detectadas entre arranques */
export function getUptimePercentage(): number {
  const state = readState();
  if (!state) return 100;

  const totalWindowMs = Date.now() - new Date(state.firstStartAt).getTime();
  if (totalWindowMs <= 0) return 100;

  const uptimeMs = Math.max(0, totalWindowMs - state.downtimeMs);
  const percentage = (uptimeMs / totalWindowMs) * 100;
  return Math.round(Math.min(100, Math.max(0, percentage)) * 100) / 100;
}
