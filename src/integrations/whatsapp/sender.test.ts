// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { WhatsAppConfig } from "./config";
import { sendWhatsAppText, WhatsAppDeliveryError } from "./sender";

const config: WhatsAppConfig = {
  verifyToken: "verify",
  appSecret: "secret",
  accessToken: "access-token-secret",
  graphApiVersion: "v99.0",
  buyerPhoneNumberId: "phone-buyer-001",
  businessOnboardingPhoneNumberId: "phone-business-001",
};

describe("WhatsApp Cloud API sender", () => {
  it("converts plain gateway text into Meta's outbound text payload", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        messaging_product: "whatsapp",
        contacts: [{ input: "2348012345678", wa_id: "2348012345678" }],
        messages: [{ id: "wamid.outbound-1" }],
      }),
    );
    await expect(
      sendWhatsAppText(
        {
          recipient: "2348012345678",
          phoneNumberId: "phone-buyer-001",
          text: "What paper size?",
        },
        config,
        fetchImpl,
      ),
    ).resolves.toEqual({ providerMessageId: "wamid.outbound-1" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://graph.facebook.com/v99.0/phone-buyer-001/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer access-token-secret",
          "content-type": "application/json",
        },
      }),
    );
    const init = fetchImpl.mock.calls[0][1]!;
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "2348012345678",
      type: "text",
      text: { preview_url: false, body: "What paper size?" },
    });
  });

  it("reports provider errors without exposing the response body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ error: { message: "sensitive provider detail" } }, { status: 401 }),
      );
    const error = await sendWhatsAppText(
      { recipient: "2348012345678", phoneNumberId: "phone-buyer-001", text: "Hello" },
      config,
      fetchImpl,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WhatsAppDeliveryError);
    expect((error as Error).message).not.toContain("sensitive provider detail");
  });
});
