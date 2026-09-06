import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { HttpError, ok } from "@/lib/http/response";
import { recordPilotEvent } from "@/features/analytics/pilot";
import { resolveRecipient } from "@/features/notifications/access";
import { markNotificationRead } from "@/features/notifications/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mark one notification read (milestone 7 §18). Reading is NOT taking the
 * underlying action — this only sets `read_at`. The write is scoped to the
 * caller's (audience, recipientKey), so it cannot touch another person's item;
 * a mismatch is a 404, not a silent success. Idempotent.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const db = await getDb();
  const { audience, recipientKey } = await resolveRecipient(db, request, url);

  const updated = await markNotificationRead(db, id, audience, recipientKey);
  if (!updated) {
    // It does not exist, or it is not yours.
    throw new HttpError(404, "NOTIFICATION_NOT_FOUND", "No notification with that id.");
  }
  void recordPilotEvent(db, {
    name: "notification_opened",
    actorKey: recipientKey,
    taskId: updated.entityType === "task" ? updated.entityId : null,
    props: { level: updated.level, event: updated.event },
  });
  return ok({ id: updated.id, read: true });
});
