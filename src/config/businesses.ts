import { Business } from '../types/business';

// Mapa de negocios indexado por el phoneNumberId de WhatsApp Cloud API
// (el ID del numero que RECIBE el mensaje, no el numero del cliente).
// Sustituye las claves por los phoneNumberId reales de cada negocio en Meta.
const businesses: Record<string, Business> = {
  '111111111111111': {
    id: 'clinica-dental-ejemplo',
    name: 'Clinica Dental Ejemplo',
    type: 'dental',
    services: [
      { name: 'Limpieza dental', price: '45€', duration: '30 min' },
      { name: 'Revision de ortodoncia', price: '60€', duration: '20 min' },
      { name: 'Blanqueamiento dental', price: '150€', duration: '45 min' },
      { name: 'Implante dental', price: 'Desde 900€', duration: '60 min' },
      { name: 'Urgencias dentales', duration: '30 min' },
    ],
    schedule: [
      { day: 'Lunes-Viernes', hours: '09:00-20:00' },
      { day: 'Sabado', hours: '09:00-14:00' },
    ],
    address: 'Calle Mayor 45, Madrid',
    phone: '+34 910 000 000',
    website: 'https://clinicadentalejemplo.com',
    notificationPhone: '34600111222',
  },
  '222222222222222': {
    id: 'estudio-arquitectura-ejemplo',
    name: 'Estudio Arquitectura Ejemplo',
    type: 'arquitectura',
    services: [
      { name: 'Consulta inicial de proyecto', price: 'Gratuita', duration: '30 min' },
      { name: 'Proyecto de reforma integral', price: 'Desde 2.500€' },
      { name: 'Direccion de obra', price: 'Presupuesto a medida' },
      { name: 'Certificado energetico', price: '120€', duration: '1 dia' },
    ],
    schedule: [{ day: 'Lunes-Viernes', hours: '10:00-14:00,16:00-19:00' }],
    address: 'Avenida de la Ilustracion 12, Madrid',
    phone: '+34 911 111 111',
    customInstructions:
      'Los presupuestos de reforma integral siempre requieren una visita previa al inmueble antes de dar una cifra cerrada. No des precios exactos de reforma sin dejar esto claro.',
    notificationPhone: '34600333444',
  },
  // Negocio de demo: usado para enseñar el bot y el dashboard llenos de datos realistas
  // a clientes potenciales. Los leads de ejemplo estan pre-cargados en data/leads.json.
  // Datos reales de Camacho Macia Arquitectos (camachomaciaarquitectos.com), cliente de Madrid.
  '333333333333333': {
    id: 'camacho-macia-arquitectos',
    name: 'Estudio Arquitectura Madrid',
    type: 'arquitectura',
    services: [
      { name: 'Consulta inicial de proyecto', price: 'Gratuita', duration: '30 min' },
      { name: 'Vivienda unifamiliar de autor', price: 'Presupuesto a medida' },
      { name: 'Vivienda colectiva y residencial', price: 'Presupuesto a medida' },
      { name: 'Arquitectura singular (equipamientos culturales)', price: 'Presupuesto a medida' },
      { name: 'Direccion de obra', price: 'Presupuesto a medida' },
    ],
    schedule: [{ day: 'Lunes-Viernes', hours: '09:30-19:30' }],
    address: 'Paseo de los Ciruelos nº1, 28660 Boadilla del Monte, Madrid',
    phone: '+34 910 063 053',
    website: 'https://camachomaciaarquitectos.com',
    customInstructions:
      'Estudio fundado en 1998, con mas de 25 años de trayectoria combinando practica profesional, investigacion y docencia universitaria. Especializado en arquitectura singularizada (auditorios, teatros, museos), vivienda colectiva y concursos nacionales e internacionales. No des presupuestos cerrados por WhatsApp: cada proyecto requiere una consulta inicial para valorar alcance antes de dar cualquier cifra.',
    notificationPhone: '34600555666',
  },
};

/** Devuelve la configuracion del negocio asociado a un phoneNumberId de WhatsApp, o undefined si no existe */
export function getBusinessByPhoneNumberId(phoneNumberId: string): Business | undefined {
  return businesses[phoneNumberId];
}

/** Devuelve la configuracion del negocio por su id logico (business.id), o undefined si no existe */
export function getBusinessById(businessId: string): Business | undefined {
  return Object.values(businesses).find((business) => business.id === businessId);
}

/** Numero de negocios configurados (para el health check) */
export function getBusinessCount(): number {
  return Object.keys(businesses).length;
}

/** Devuelve todos los negocios configurados (para tareas programadas y el script de onboarding) */
export function getAllBusinesses(): Business[] {
  return Object.values(businesses);
}
