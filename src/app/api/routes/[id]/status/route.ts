import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { getManageToken, getOperator } from "@/lib/http/operator";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { manageTokenMatchesRoute } from "@/features/businesses/access";
import { changeRouteStatus, changeRouteStatusRequestSchema } from "@/features/routes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route(async (request, context) => {
  const { id } = await context.params;
  const key = requireIdempotencyKey(request);
  const body = await parseJsonBody(request, changeRouteStatusRequestSchema);
  const operator = getOperator(request);
  const db = await getDb();
  const canManage = await manageTokenMatchesRoute(db, id, getManageToken(request));

  return runIdempotent(
    db,
    `routes.status:${id}`,
    key,
    { ...body, by: operator?.label ?? (canManage ? "supplier" : "anon") },
    async () => {
      const updated = await changeRouteStatus(
        db,
        id,
        body.status,
        { operator, canManage },
        body.checklist,
      );
      return { status: 200, body: { success: true, data: updated } };
    },
  );
});
