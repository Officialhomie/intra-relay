import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { requireOperator } from "@/lib/http/operator";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { submitQuote, submitQuoteRequestSchema } from "@/features/quotes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const key = requireIdempotencyKey(request);
  // Quote responses are recorded by an operator on behalf of the supplier.
  requireOperator(request);
  const body = await parseJsonBody(request, submitQuoteRequestSchema);
  const db = await getDb();

  return runIdempotent(db, `routes.quotes:${id}`, key, body, async () => {
    const result = await submitQuote(db, id, body);
    return { status: 201, body: { success: true, data: result } };
  });
});
