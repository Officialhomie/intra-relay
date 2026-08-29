import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { getManageToken, getOperator } from "@/lib/http/operator";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { HttpError } from "@/lib/http/response";
import { manageTokenMatchesRoute } from "@/features/businesses/access";
import {
  declineRequest,
  declineRequestSchema,
  submitQuote,
  submitQuoteRequestSchema,
} from "@/features/quotes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const key = requireIdempotencyKey(request);

  const raw = (await request
    .clone()
    .json()
    .catch(() => null)) as { decline?: unknown } | null;
  const isDecline = !!raw && raw.decline === true;

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

  const body = await parseJsonBody(request, submitQuoteRequestSchema);
  return runIdempotent(db, `routes.quotes:${id}`, key, body, async () => {
    const result = await submitQuote(db, id, body);
    return { status: 201, body: { success: true, data: result } };
  });
});
