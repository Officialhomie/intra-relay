import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { createFeedback, createFeedbackRequestSchema } from "@/features/feedback/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const key = requireIdempotencyKey(request);
  const body = await parseJsonBody(request, createFeedbackRequestSchema);
  const db = await getDb();

  return runIdempotent(db, "feedback.create", key, body, async () => {
    const feedback = await createFeedback(db, body);
    return { status: 201, body: { success: true, data: feedback } };
  });
});
