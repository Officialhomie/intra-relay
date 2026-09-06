import type { ActivityItem } from "../run/activity";
import type { OutcomeCopy } from "../run/copy";
import type { RunStage } from "../run/stages";

/**
 * The client-side mirror of `AgentRunView`. Declared here rather than imported
 * from the server module so the console never pulls the agent runtime into the
 * browser bundle.
 */

export type RunStatus =
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "DECLINED"
  | "NO_VIABLE_OFFER"
  | "CLARIFICATION_NEEDED"
  | "FAILED";

export interface TraceEntry {
  at: string;
  kind: string;
  label: string;
  detail?: string;
  durationMs?: number;
}

export interface Understanding {
  quantity: number | null;
  size: string | null;
  colour: string | null;
  deadline: string | null;
  deliveryArea: string | null;
  summary: string;
}

export interface OfferView {
  businessSlug: string;
  businessName: string;
  price: string;
  priceBasis: "fixed price" | "estimate";
  turnaround: string;
  expiresAt: string | null;
  comparedToPick: string | null;
}

export interface RecommendationView {
  businessSlug: string;
  businessName: string;
  price: string;
  priceBasis: "fixed price" | "estimate";
  turnaround: string;
  issuedAt: string | null;
  expiresAt: string | null;
  selectionReason: string;
  uncertainties: string[];
  tradeoffs: string[];
  offerFingerprint: string;
  finalOrderStatement: string;
  modelReasoned: boolean;
  taskId: string;
  details: { label: string; value: string }[];
}

export interface AgentRun {
  runId: string;
  status: RunStatus;
  mode: "assisted" | "deterministic";
  model: { provider: string; model: string; configured: boolean; calls: number };
  request: string;
  notPersisted: true;
  createdAt: string;
  updatedAt: string;
  stages: RunStage[];
  headline: string;
  activity: ActivityItem[];
  understanding: Understanding | null;
  clarification: { question: string; missing: string[] } | null;
  recommendation: RecommendationView | null;
  alternatives: OfferView[];
  ruledOut: { name: string; because: string }[];
  decision: { outcome: "APPROVED" | "DECLINED"; at: string } | null;
  commitment: {
    status: string;
    attestationUid: string | null;
    attestationTxHash: string | null;
    mode: string | null;
    simulated: boolean;
  } | null;
  outcome: OutcomeCopy | null;
  taskId: string | null;
  progress: { providersFound: number; quotesRequested: number; quotesReceived: number };
  requestedQuotes: { taskId: string; businessSlug: string; businessName: string }[];
  reasons: { code: string; statement: string }[];
  summary: string;
  trace: { entries: TraceEntry[] } | null;
  error: string | null;
}

/** A buyer's correction to the agent's reading, as the API accepts it. */
export interface BriefCorrectionInput {
  quantity?: number | null;
  size?: string | null;
  colour?: string | null;
  deadline?: string | null;
  deliveryArea?: string | null;
}

export type { ActivityItem, OutcomeCopy, RunStage };
