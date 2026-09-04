import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { parseJsonBody } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { resolveRecipient } from "@/features/notifications/access";
import { getPreferences, setPreferences } from "@/features/notifications/preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  pushEnabled: z.boolean().optional(),
  pushInformational: z.boolean().optional(),
});

/** The person's notification preferences (milestone 7 §16). */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const db = await getDb();
  const { audience, recipientKey } = await resolveRecipient(db, request, url);
  return ok(await getPreferences(db, audience, recipientKey));
});

export const PATCH = route(async (request) => {
  const url = new URL(request.url);
  const db = await getDb();
  const { audience, recipientKey } = await resolveRecipient(db, request, url);
  const patch = await parseJsonBody(request, patchSchema);
  return ok(await setPreferences(db, audience, recipientKey, patch));
});
