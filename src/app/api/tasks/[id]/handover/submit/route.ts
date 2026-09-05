import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { getManageToken } from "@/lib/http/operator";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { runIdempotent } from "@/lib/http/idempotency";
import {
  submitHandoverSignature,
  toPublicHandoverAttestation,
} from "@/features/attestation/handover-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** 65-byte `eth_signTypedData_v4` signature from the merchant's own wallet. */
  signature: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte hex signature."),
});

/**
 * Handover attestation, step 2 (ADR-018, milestone 9). The merchant's wallet
 * has signed the typed data from step 1; this relays it to EAS via
 * `attestByDelegation`. Idempotent — a second call returns the stored result
 * rather than relaying twice. Headers: `x-manage-token`, `Idempotency-Key`.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const key = requireIdempotencyKey(request);
  const manageToken = getManageToken(request);
  const body = await parseJsonBody(request, bodySchema);
  const db = await getDb();

  return runIdempotent(db, `handover.submit:${id}`, key, { id }, async () => {
    const result = await submitHandoverSignature(db, id, {
      manageToken,
      signature: body.signature as `0x${string}`,
    });
    return {
      status: 201,
      body: {
        success: true,
        data: {
          ...toPublicHandoverAttestation(result.row),
          wrote: result.wrote,
          mode: result.mode,
        },
      },
    };
  });
});
