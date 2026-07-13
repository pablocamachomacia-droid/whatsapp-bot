/**
 * CLI de onboarding: da de alta un nuevo negocio en src/config/businesses.ts de forma interactiva.
 * Uso: npm run onboard
 */
import { createInterface, Interface } from 'readline/promises';
import fs from 'fs';
import path from 'path';
import { getAllBusinesses, getBusinessByPhoneNumberId } from '../src/config/businesses';
import { Business, BusinessService, BusinessScheduleEntry, BusinessType } from '../src/types/business';

const VALID_TYPES: BusinessType[] = ['dental', 'arquitectura', 'estetica', 'generic'];
const BUSINESSES_FILE = path.join(__dirname, '..', 'src', 'config', 'businesses.ts');
const INSERTION_ANCHOR =
  '/** Devuelve la configuracion del negocio asociado a un phoneNumberId de WhatsApp, o undefined si no existe */';

async function ask(rl: Interface, question: string): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

async function askRequired(rl: Interface, question: string): Promise<string> {
  let answer = await ask(rl, question);
  while (!answer) {
    console.log('Este dato es obligatorio.');
    answer = await ask(rl, question);
  }
  return answer;
}

async function askType(rl: Interface): Promise<BusinessType> {
  const question = `Tipo de negocio (${VALID_TYPES.join(' / ')}): `;
  let answer = (await ask(rl, question)).toLowerCase();
  while (!VALID_TYPES.includes(answer as BusinessType)) {
    console.log(`Debe ser uno de: ${VALID_TYPES.join(', ')}`);
    answer = (await ask(rl, question)).toLowerCase();
  }
  return answer as BusinessType;
}

async function askYesNo(rl: Interface, question: string): Promise<boolean> {
  const answer = (await ask(rl, question)).toLowerCase();
  return answer === 's' || answer === 'si' || answer === 'sí' || answer === 'y' || answer === 'yes';
}

async function askServices(rl: Interface): Promise<BusinessService[]> {
  console.log('\n--- Servicios (escribe "listo" en el nombre para terminar) ---');
  const services: BusinessService[] = [];

  for (;;) {
    const name = await ask(rl, `Servicio #${services.length + 1} - nombre: `);
    if (name.toLowerCase() === 'listo') break;
    if (!name) continue;

    const price = await ask(rl, '  Precio (opcional, Enter para omitir): ');
    const duration = await ask(rl, '  Duracion (opcional, Enter para omitir): ');

    services.push({
      name,
      ...(price ? { price } : {}),
      ...(duration ? { duration } : {}),
    });
  }

  return services;
}

async function askSchedule(rl: Interface): Promise<BusinessScheduleEntry[]> {
  console.log('\n--- Horario (escribe "listo" en el dia para terminar) ---');
  console.log('Ejemplo de dia: "Lunes-Viernes" o "Sabado". Ejemplo de horas: "09:00-20:00" o "10:00-14:00,16:00-19:00"');
  const schedule: BusinessScheduleEntry[] = [];

  for (;;) {
    const day = await ask(rl, `Dia/rango #${schedule.length + 1}: `);
    if (day.toLowerCase() === 'listo') break;
    if (!day) continue;

    const hours = await askRequired(rl, '  Horas: ');
    schedule.push({ day, hours });
  }

  return schedule;
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(baseName: string): string {
  const base = slugify(baseName) || 'negocio';
  const existingIds = new Set(getAllBusinesses().map((business) => business.id));
  if (!existingIds.has(base)) return base;

  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function printSummary(phoneNumberId: string, business: Business): void {
  console.log('\n=== Resumen ===');
  console.log(`Phone Number ID: ${phoneNumberId}`);
  console.log(`ID interno: ${business.id}`);
  console.log(`Nombre: ${business.name}`);
  console.log(`Tipo: ${business.type}`);
  console.log(`Telefono: ${business.phone}`);
  console.log(`Direccion: ${business.address}`);
  if (business.website) console.log(`Web: ${business.website}`);
  if (business.notificationPhone) console.log(`Notificaciones a: ${business.notificationPhone}`);

  console.log('Servicios:');
  for (const service of business.services) {
    const details = [service.price, service.duration].filter(Boolean).join(' / ');
    console.log(`  - ${service.name}${details ? ` (${details})` : ''}`);
  }

  console.log('Horario:');
  for (const entry of business.schedule) {
    console.log(`  - ${entry.day}: ${entry.hours}`);
  }

  if (business.customInstructions) {
    console.log(`Instrucciones especiales: ${business.customInstructions}`);
  }
}

function jsStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function formatServiceEntry(service: BusinessService): string {
  const parts = [`name: ${jsStringLiteral(service.name)}`];
  if (service.price) parts.push(`price: ${jsStringLiteral(service.price)}`);
  if (service.duration) parts.push(`duration: ${jsStringLiteral(service.duration)}`);
  return `{ ${parts.join(', ')} }`;
}

function formatScheduleEntry(entry: BusinessScheduleEntry): string {
  return `{ day: ${jsStringLiteral(entry.day)}, hours: ${jsStringLiteral(entry.hours)} }`;
}

function formatBusinessEntry(phoneNumberId: string, business: Business): string {
  const lines: string[] = [];
  lines.push(`  ${jsStringLiteral(phoneNumberId)}: {`);
  lines.push(`    id: ${jsStringLiteral(business.id)},`);
  lines.push(`    name: ${jsStringLiteral(business.name)},`);
  lines.push(`    type: ${jsStringLiteral(business.type)},`);
  lines.push('    services: [');
  for (const service of business.services) {
    lines.push(`      ${formatServiceEntry(service)},`);
  }
  lines.push('    ],');
  lines.push('    schedule: [');
  for (const entry of business.schedule) {
    lines.push(`      ${formatScheduleEntry(entry)},`);
  }
  lines.push('    ],');
  lines.push(`    address: ${jsStringLiteral(business.address)},`);
  lines.push(`    phone: ${jsStringLiteral(business.phone)},`);
  if (business.website) lines.push(`    website: ${jsStringLiteral(business.website)},`);
  if (business.customInstructions) lines.push(`    customInstructions: ${jsStringLiteral(business.customInstructions)},`);
  if (business.notificationPhone) lines.push(`    notificationPhone: ${jsStringLiteral(business.notificationPhone)},`);
  lines.push('  },');
  return lines.join('\n');
}

function saveBusinessToFile(phoneNumberId: string, business: Business): void {
  const content = fs.readFileSync(BUSINESSES_FILE, 'utf-8');

  const anchorIndex = content.indexOf(INSERTION_ANCHOR);
  if (anchorIndex === -1) {
    throw new Error('No se encontro el punto de insercion esperado en businesses.ts. Añade el negocio manualmente.');
  }

  const closingIndex = content.lastIndexOf('\n};', anchorIndex);
  if (closingIndex === -1) {
    throw new Error('No se encontro el cierre del objeto "businesses" en businesses.ts.');
  }

  const entry = formatBusinessEntry(phoneNumberId, business);
  const newContent = `${content.slice(0, closingIndex)}\n${entry}${content.slice(closingIndex)}`;

  fs.writeFileSync(BUSINESSES_FILE, newContent, 'utf-8');
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('=== Alta de nuevo negocio ===\n');

  try {
    const name = await askRequired(rl, 'Nombre del negocio: ');
    const type = await askType(rl);

    let phoneNumberId = await askRequired(rl, 'Phone Number ID de WhatsApp (Meta): ');
    while (getBusinessByPhoneNumberId(phoneNumberId)) {
      console.log('⚠️  Ya existe un negocio con ese phoneNumberId.');
      phoneNumberId = await askRequired(rl, 'Introduce otro Phone Number ID: ');
    }

    const phone = await askRequired(rl, 'Telefono de contacto (ej. +34 910 000 000): ');
    const address = await askRequired(rl, 'Direccion: ');
    const website = await ask(rl, 'Web (opcional, Enter para omitir): ');
    const customInstructions = await ask(rl, 'Instrucciones especificas para Claude (opcional, Enter para omitir): ');
    const notificationPhone = await ask(
      rl,
      'Numero de WhatsApp para notificaciones (formato API sin "+", ej. 34600111222; Enter para omitir): '
    );

    const services = await askServices(rl);
    const schedule = await askSchedule(rl);

    const business: Business = {
      id: uniqueId(name),
      name,
      type,
      services,
      schedule,
      address,
      phone,
      ...(website ? { website } : {}),
      ...(customInstructions ? { customInstructions } : {}),
      ...(notificationPhone ? { notificationPhone } : {}),
    };

    printSummary(phoneNumberId, business);

    const confirmed = await askYesNo(rl, '\n¿Guardar este negocio en businesses.ts? (s/n): ');
    if (!confirmed) {
      console.log('Cancelado. No se ha guardado nada.');
      return;
    }

    saveBusinessToFile(phoneNumberId, business);
    console.log(`\n✅ Negocio "${business.name}" añadido correctamente (id: ${business.id}).`);
    console.log('Ejecuta "npm run build" para verificar que compila y reinicia el servidor para que tome efecto.');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
