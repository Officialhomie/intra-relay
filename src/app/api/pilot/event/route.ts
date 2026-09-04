import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { parseJsonBody } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { recordPilotEvent, type PilotEventName } from "@/features/analytics/pilot";
import { resolveRecipient } from "@/features/notifications/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A narrow client hook into pilot instrumentation (milestone 7 phase C §32).
 * Only the handful of client-observable moments are accepted; the actor is
 * resolved server-side, and no payload / personal data is ever recorded.
 */
const CLIENT_EVENTS: readonly PilotEventName[] = [
  "push_permission_prompted",
  "push_permission_granted",
  "push_permission_denied",
  "pwa_install_prompted",
  "pwa_install_accepted",
  "workflow_resumed",
];

const bodySchema = z.object({
  name: z.string(),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const POST = route(async (request) => {
  const url = new URL(request.url);
  const body = await parseJsonBody(request, bodySchema);
  if (!CLIENT_EVENTS.includes(body.name as PilotEventName)) {
    return ok({ recorded: false });
  }

  const db = await getDb();
  let actorKey: string | null = null;
  try {
    actorKey = (await resolveRecipient(db, request, url)).recipientKey;
  } catch {
    /* anonymous is fine — the event still counts */
  }

  await recordPilotEvent(db, {
    name: body.name as PilotEventName,
    actorKey,
    props: body.props,
  });
  return ok({ recorded: true });
});
