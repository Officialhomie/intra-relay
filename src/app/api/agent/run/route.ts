import { z } from "zod";

import { route } from "@/lib/http/handler";
import { parseJsonBody, requireSessionId } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { FLYER_COLOURS, FLYER_SIZES } from "@/features/routes/flyer-printing";
import { startAgentRun } from "@/features/agent/run/service";
import { toAgentRunView } from "@/features/agent/run/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A buyer's correction to how a previous run read the same request. Optional —
 * the normal path is natural language alone. Every field is validated against
 * the same enums the printing route accepts, so a correction can never widen
 * what the brief is allowed to contain.
 */
const correctionSchema = z.object({
  quantity: z.number().int().positive().max(100_000).nullable().optional(),
  size: z.enum(FLYER_SIZES).nullable().optional(),
  colour: z.enum(FLYER_COLOURS).nullable().optional(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date.")
    .nullable()
    .optional(),
  deliveryArea: z.string().trim().max(120).nullable().optional(),
});

const startRunSchema = z.object({
  request: z.string().trim().min(1, "Describe what you need printed.").max(2000),
  /** "assisted" uses the LLM layer (falls back to deterministic on any model error). */
  mode: z.enum(["assisted", "deterministic"]).optional(),
  correction: correctionSchema.optional(),
});

/** The route's enum uses hyphens; the agent's brief carries the spoken phrase. */
const COLOUR_PHRASE: Record<string, string> = {
  "full-colour": "full colour",
  "black-and-white": "black and white",
};

/**
 * Start a buyer-agent run.
 *
 * The agent discovers providers, compares quotes and reaches a recommendation
 * on its own; it stops there. A human decision (POST .../approve) is the only
 * way past it (BR-001). The run's orchestration metadata is NOT persisted.
 */
export const POST = route(async (request) => {
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, startRunSchema);

  const correction = body.correction;
  const run = startAgentRun({
    request: body.request,
    buyerSessionId: sessionId,
    origin: url.origin,
    mode: body.mode,
    briefCorrection: correction
      ? {
          ...correction,
          colour:
            correction.colour === undefined
              ? undefined
              : correction.colour === null
                ? null
                : (COLOUR_PHRASE[correction.colour] ?? correction.colour),
        }
      : undefined,
  });

  return ok(toAgentRunView(run), 202);
});
