export interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  // Meta envia muchos otros tipos (image, document, location, sticker...) que no manejamos:
  // "string" es la representacion honesta; un union con literales + string no aporta narrowing real.
  type: string;
  text?: { body: string };
}

export interface WhatsAppWebhookPayload {
  entry: Array<{
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { phone_number_id: string };
        messages?: WhatsAppTextMessage[];
      };
    }>;
  }>;
}
