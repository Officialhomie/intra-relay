import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { getManageToken, getOperator } from "@/lib/http/operator";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { HttpError } from "@/lib/http/response";
import { manageTokenMatchesRoute } from "@/features/businesses/access";
import {
  providerCannotFulfil,
  providerExceptionSchema,
  withdrawAsProvider,
} from "@/features/tasks/exception-service";
import { reviseQuote, reviseQuoteRequestSchema } from "@/features/quotes/revision";
import {
  declineRequest,
  declineRequestSchema,
  submitQuote,
  submitQuoteRequestSchema,
} from "@/features/quotes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A business answers a request.
 *
 *   { …terms }                    → the first price for this order
 *   { revise: true, …terms }      → a different price (quotes/revision.ts)
 *   { decline: true, reason }     → turn the job down
 *
 * A revision never edits the existing offer. Before the buyer accepts it
 * replaces it; after they accept it can only be PROPOSED, and the buyer decides.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const key = requireIdempotencyKey(request);

  const raw = (await request
    .clone()
    .json()
    .catch(() => null)) as {
    decline?: unknown;
    revise?: unknown;
    withdraw?: unknown;
    cannotFulfil?: unknown;
  } | null;
  const isDecline = !!raw && raw.decline === true;
  const isRevision = !!raw && raw.revise === true;
  const isWithdraw = !!raw && raw.withdraw === true;
  const isCannotFulfil = !!raw && raw.cannotFulfil === true;

  const operator = getOperator(request);
  const db = await getDb();
  const canManage = await manageTokenMatchesRoute(db, id, getManageToken(request));
  if (!operator && !canManage) {
    throw new HttpError(
      401,
      "SUPPLIER_AUTH_REQUIRED",
      "Responding to a request needs an operator key or the supplier manage token.",
    );
  }

  if (isDecline) {
    const body = await parseJsonBody(request, declineRequestSchema);
    return runIdempotent(db, `routes.decline:${id}`, key, body, async () => {
      const result = await declineRequest(db, id, body);
      return { status: 200, body: { success: true, data: result } };
    });
  }

  if (isWithdraw) {
    const body = await parseJsonBody(request, providerExceptionSchema);
    return runIdempotent(db, `routes.withdraw:${id}`, key, body, async () => {
      const result = await withdrawAsProvider(db, id, body);
      return { status: 200, body: { success: true, data: result } };
    });
  }

  if (isCannotFulfil) {
    const body = await parseJsonBody(request, providerExceptionSchema);
    return runIdempotent(db, `routes.cannot_fulfil:${id}`, key, body, async () => {
      const result = await providerCannotFulfil(db, id, body);
      return { status: 200, body: { success: true, data: result } };
    });
  }

  if (isRevision) {
    const body = await parseJsonBody(request, reviseQuoteRequestSchema);
    return runIdempotent(db, `routes.revise:${id}`, key, body, async () => {
      const result = await reviseQuote(db, id, body);
      return { status: 200, body: { success: true, data: result } };
    });
  }

  const body = await parseJsonBody(request, submitQuoteRequestSchema);
  return runIdempotent(db, `routes.quotes:${id}`, key, body, async () => {
    const result = await submitQuote(db, id, body);
    return { status: 201, body: { success: true, data: result } };
  });
});
