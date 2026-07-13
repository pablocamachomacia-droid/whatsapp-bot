export interface BusinessService {
  name: string;
  price?: string;
  duration?: string;
}

export interface BusinessScheduleEntry {
  day: string;
  hours: string;
}

export type BusinessType = 'dental' | 'arquitectura' | 'estetica' | 'generic';

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  services: BusinessService[];
  schedule: BusinessScheduleEntry[];
  address: string;
  phone: string;
  website?: string;
  customInstructions?: string;
  /** Numero de WhatsApp (formato API, sin '+', ej. "34600111222") donde el negocio recibe notificaciones de nuevas citas/leads */
  notificationPhone?: string;
}
