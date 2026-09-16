export function textWebhook(input: {
  phoneNumberId?: string;
  sender?: string;
  messageId?: string;
  text?: string;
  timestamp?: string;
  type?: string;
}) {
  const type = input.type ?? "text";
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-test-001",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: input.phoneNumberId ?? "phone-buyer-001",
              },
              contacts: [
                {
                  profile: { name: "Fixture Person" },
                  wa_id: input.sender ?? "2348012345678",
                },
              ],
              messages: [
                {
                  from: input.sender ?? "2348012345678",
                  id: input.messageId ?? "wamid.fixture-001",
                  timestamp: input.timestamp ?? "1789552800",
                  type,
                  ...(type === "text" ? { text: { body: input.text ?? "Hello" } } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function statusWebhook() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-test-001",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "phone-buyer-001" },
              statuses: [{ id: "wamid.outbound-001", status: "delivered" }],
            },
          },
        ],
      },
    ],
  };
}
