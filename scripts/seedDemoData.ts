/**
 * Carga los leads de demo (examples/demo-leads-seed.json) en DATA_PATH/leads.json.
 * Util tras un clon nuevo o un despliegue, ya que data/ esta en .gitignore (protege
 * datos reales de clientes) y por tanto nunca viaja con git.
 * Uso: npm run seed:demo
 */
import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline/promises';
import { env } from '../src/config/env';

const SEED_FILE = path.join(__dirname, '..', 'examples', 'demo-leads-seed.json');
const TARGET_FILE = path.join(env.dataPath, 'leads.json');

async function confirmOverwrite(existingCount: number): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`⚠️  Ya existe ${TARGET_FILE} con ${existingCount} lead(s) guardado(s).`);
  const answer = await rl.question('Esto SOBRESCRIBIRA ese archivo con los datos de demo. Escribe "si" para confirmar: ');
  rl.close();
  return answer.trim().toLowerCase() === 'si';
}

async function main(): Promise<void> {
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`No se encuentra el archivo de semilla: ${SEED_FILE}`);
  }

  if (!fs.existsSync(env.dataPath)) {
    fs.mkdirSync(env.dataPath, { recursive: true });
  }

  if (fs.existsSync(TARGET_FILE)) {
    const existing: unknown = JSON.parse(fs.readFileSync(TARGET_FILE, 'utf-8'));
    const existingCount = Array.isArray(existing) ? existing.length : 0;

    if (existingCount > 0 && !(await confirmOverwrite(existingCount))) {
      console.log('Cancelado. No se ha modificado nada.');
      return;
    }
  }

  const seed = fs.readFileSync(SEED_FILE, 'utf-8');
  fs.writeFileSync(TARGET_FILE, seed, 'utf-8');
  console.log(`✅ Datos de demo cargados en ${TARGET_FILE}`);
}

main().catch((error) => {
  console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
