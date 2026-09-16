import { z } from "zod";

const metadataSchema = z.object({
  display_phone_number: z.string().optional(),
  phone_number_id: z.string().trim().min(1).max(200),
});

const contactSchema = z.object({
  wa_id: z.string().trim().min(1).max(200),
  profile: z.object({ name: z.string().max(200).optional() }).optional(),
});

const messageSchema = z.object({
  from: z.string().trim().min(1).max(200),
  id: z.string().trim().min(1).max(200),
  timestamp: z.string().regex(/^\d{1,16}$/),
  type: z.string().trim().min(1).max(50),
  text: z.object({ body: z.string().trim().min(1).max(4096) }).optional(),
});

const changeSchema = z.object({
  field: z.string(),
  value: z
    .object({
      messaging_product: z.string().optional(),
      metadata: metadataSchema.optional(),
      contacts: z.array(contactSchema).max(50).optional(),
      messages: z.array(messageSchema).max(50).optional(),
      statuses: z.array(z.unknown()).max(1000).optional(),
    })
    .passthrough(),
});

export const metaWhatsAppWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        changes: z.array(changeSchema).max(50),
      }),
    )
    .min(1)
    .max(50),
});

export type MetaWhatsAppWebhook = z.infer<typeof metaWhatsAppWebhookSchema>;

export interface WhatsAppTextEnvelope {
  phoneNumberId: string;
  recipient: string;
  providerMessageId: string;
  text: string;
  timestampSeconds: number;
}

export interface WhatsAppSendReceipt {
  providerMessageId: string;
}
