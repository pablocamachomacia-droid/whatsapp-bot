/**
 * Test de humo: arranca el servidor real contra un entorno de prueba aislado y verifica
 * los endpoints criticos con fetch nativo (sin jest ni supertest).
 * Uso: npm run test:smoke
 */
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}`;
const VERIFY_TOKEN = 'smoke-test-verify-token';
const INTERNAL_API_KEY = 'smoke-test-internal-key';
const SMOKE_DATA_PATH = path.join(__dirname, '.smoke-data');

let passed = 0;
let failed = 0;

function report(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(): ChildProcess {
  const tsxCli = path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverEntry = path.join(__dirname, '..', 'src', 'server.ts');

  return spawn(process.execPath, [tsxCli, serverEntry], {
    env: {
      ...process.env,
      PORT: String(PORT),
      WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
      WHATSAPP_ACCESS_TOKEN: 'smoke-test-access-token',
      WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
      APP_SECRET: 'smoke-test-app-secret',
      ANTHROPIC_API_KEY: 'smoke-test-anthropic-key',
      INTERNAL_API_KEY,
      DATA_PATH: SMOKE_DATA_PATH,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

async function waitForServer(maxAttempts = 40): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return true;
    } catch {
      // el servidor aun no acepta conexiones
    }
    await wait(250);
  }
  return false;
}

// --- Casos de prueba ---

async function testHealthCheck(): Promise<void> {
  const res = await fetch(`${BASE_URL}/health`);
  const body = (await res.json()) as { status?: string };
  report('GET /health -> 200 con status "ok"', res.status === 200 && body.status === 'ok', `status=${res.status} body=${JSON.stringify(body)}`);
}

async function testWebhookVerifyCorrectToken(): Promise<void> {
  const url = `${BASE_URL}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=smoke-challenge-123`;
  const res = await fetch(url);
  const body = await res.text();
  report(
    'GET /webhook con verify_token correcto -> devuelve hub.challenge',
    res.status === 200 && body === 'smoke-challenge-123',
    `status=${res.status} body="${body}"`
  );
}

async function testWebhookVerifyIncorrectToken(): Promise<void> {
  const url = `${BASE_URL}/webhook?hub.mode=subscribe&hub.verify_token=token-incorrecto&hub.challenge=smoke-challenge-123`;
  const res = await fetch(url);
  report('GET /webhook con verify_token incorrecto -> 403', res.status === 403, `status=${res.status}`);
}

async function testWebhookMissingSignature(): Promise<void> {
  const res = await fetch(`${BASE_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: [] }),
  });
  report('POST /webhook sin firma HMAC -> 401', res.status === 401, `status=${res.status}`);
}

async function testLeadsUnknownBusinessWithoutApiKey(): Promise<void> {
  const res = await fetch(`${BASE_URL}/leads/negocio-inexistente`);
  report('GET /leads/negocio-inexistente sin API key -> 401', res.status === 401, `status=${res.status}`);
}

async function testDashboardWithoutSessionShowsLogin(): Promise<void> {
  const res = await fetch(`${BASE_URL}/dashboard/`);
  const body = await res.text();
  // Es una SPA estatica: no hay redirect HTTP server-side. Sin sesion en localStorage
  // (que aqui no existe, es un fetch plano) el propio HTML debe traer la vista de login
  // lista para mostrarse por defecto — es el equivalente comprobable sin ejecutar el JS.
  const showsLogin = res.status === 200 && body.includes('id="login-view"');
  report('GET /dashboard sin sesion -> sirve la vista de login', showsLogin, `status=${res.status}`);
}

function cleanup(): void {
  fs.rmSync(SMOKE_DATA_PATH, { recursive: true, force: true });
}

async function main(): Promise<void> {
  console.log('=== Test de humo ===\n');

  const server = startServer();
  let exitCode: number;

  try {
    const ready = await waitForServer();
    if (!ready) {
      console.error('❌ El servidor no arranco a tiempo.');
      process.exit(1);
    }

    await testHealthCheck();
    await testWebhookVerifyCorrectToken();
    await testWebhookVerifyIncorrectToken();
    await testWebhookMissingSignature();
    await testLeadsUnknownBusinessWithoutApiKey();
    await testDashboardWithoutSessionShowsLogin();

    console.log(`\n${passed} pasados, ${failed} fallidos`);
    exitCode = failed > 0 ? 1 : 0;
  } finally {
    server.kill();
    cleanup();
  }

  process.exit(exitCode);
}

main();
