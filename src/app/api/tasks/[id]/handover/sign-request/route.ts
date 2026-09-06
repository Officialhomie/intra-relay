import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { getManageToken } from "@/lib/http/operator";
import { parseJsonBody } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { requestHandoverSignature } from "@/features/attestation/handover-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(24),
});

/**
 * Handover attestation, step 1 (ADR-018, milestone 9). The merchant presents
 * the code the buyer read aloud. On a match, returns the EIP-712 typed data
 * for the merchant's own wallet to sign — never a code, salt, or private
 * key. Headers: `x-manage-token`.
 *
 * Deliberately no `Idempotency-Key`: the endpoint is already safe to call
 * repeatedly (a still-valid pending request is returned unchanged, and a
 * wrong code never mutates state), and a fixed key would make a genuine
 * retry with a different code impossible to distinguish from a repeat.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const manageToken = getManageToken(request);
  const body = await parseJsonBody(request, bodySchema);
  const db = await getDb();

  const result = await requestHandoverSignature(db, id, {
    manageToken,
    presentedCode: body.code,
  });
  return ok(result);
});
