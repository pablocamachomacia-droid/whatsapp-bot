export type LeadStatus = 'new' | 'contacted' | 'confirmed' | 'cancelled';

export type LeadIntent = 'normal' | 'urgent' | 'complaint' | 'cancellation';

export interface Lead {
  id: string;
  businessId: string;
  phone: string;
  name?: string;
  service?: string;
  preferredDate?: string;
  preferredTime?: string;
  /** Telefono de contacto alternativo, solo si el cliente dio uno distinto al que usa para escribir */
  contactPhone?: string;
  status: LeadStatus;
  /** Ultima intencion critica detectada en la conversacion de este cliente (urgencia, queja, cancelacion) */
  intent?: LeadIntent;
  createdAt: Date;
  /** Momento del primer contacto de este cliente (no cambia una vez fijado) */
  firstContactAt: Date;
  /** Momento del ultimo mensaje/actualizacion asociado a este lead */
  lastMessageAt: Date;
  notes?: string;
}
