"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ArrowUp, Loader2, Wifi } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle } from "@/components/ui/Section";
import { useAnalytics } from "@/features/analytics/useAnalytics";
import { ApiError, apiRequest } from "@/lib/api";
import { getSessionId } from "@/lib/session";

import { ActivityFeed } from "./ActivityFeed";
import { ApprovalPanel } from "./ApprovalPanel";
import { OutcomePanel } from "./OutcomePanel";
import { RecommendationPanel } from "./RecommendationPanel";
import { StageList } from "./StageList";
import { UnderstandingCard } from "./UnderstandingCard";
import type { AgentRun, BriefCorrectionInput } from "./types";

/**
 * The buyer's whole interaction with the agent.
 *
 * One field, one intent. Everything after that is the system carrying the work
 * and reporting it in the buyer's terms — until it reaches the one decision
 * that is genuinely theirs to make.
 */

const EXAMPLES = [
  {
    label: "500 flyers by Friday",
    text: "I need 500 A5 full-colour flyers before Friday, delivered to UNILAG main gate",
  },
  {
    label: "200 leaflets by tomorrow",
    text: "200 A6 black and white leaflets by tomorrow, pick up at Yaba",
  },
  {
    label: "1000 posters for Saturday",
    text: "1000 A4 colour posters for Saturday, LASU campus",
  },
];

const POLL_MS = 1_500;
const MAX_POLLS = 120;
const MAX_RECONNECTS = 5;

type Phase = "idle" | "starting" | "working" | "deciding" | "correcting";

export function AgentConsole({
  initialRun,
  embedded = false,
}: { initialRun?: AgentRun; embedded?: boolean } = {}) {
  const [request, setRequest] = useState("");
  const [run, setRun] = useState<AgentRun | null>(initialRun ?? null);
  const [phase, setPhase] = useState<Phase>(initialRun?.status === "RUNNING" ? "working" : "idle");
  const [decidePending, setDecidePending] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [problem, setProblem] = useState<{ title: string; body: string; restart: boolean } | null>(
    null,
  );
  const [reconnecting, setReconnecting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decisionRef = useRef<HTMLDivElement | null>(null);
  const announcedRef = useRef<string | null>(null);

  const analytics = useAnalytics("buyer");
  const emitted = useRef<Set<string>>(new Set());
  const emitOnce = useCallback((key: string, fire: () => void) => {
    if (emitted.current.has(key)) return;
    emitted.current.add(key);
    fire();
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // When the conversation layer starts the run, pick it up and poll to settle.
  useEffect(() => {
    if (initialRun?.status === "RUNNING") {
      pollRef.current = setTimeout(() => void poll(initialRun.runId), 700);
    }
    // Runs once, for the run this console was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus to the decision once — and only once — it becomes actionable, so
  // a keyboard or screen-reader user is taken to the thing that needs them.
  useEffect(() => {
    if (run?.status === "AWAITING_APPROVAL" && announcedRef.current !== run.runId) {
      announcedRef.current = run.runId;
      decisionRef.current?.focus();
    }
  }, [run?.status, run?.runId]);

  // Behavioural funnel: discovery -> results -> approval view (M9.5 §9, §11).
  // Metadata only, keyed by run id so each stage fires at most once.
  useEffect(() => {
    if (!run) return;
    const k = (name: string) => `${run.runId}:${name}`;
    if (run.status === "RUNNING") {
      emitOnce(k("discovery"), () => analytics.track("discovery_started", {}));
    }
    const settledWithOptions =
      run.status === "AWAITING_APPROVAL" ||
      run.recommendation != null ||
      run.status === "NO_VIABLE_OFFER";
    if (settledWithOptions) {
      emitOnce(k("results"), () =>
        analytics.track("results_shown", {
          option_count: run.alternatives.length + (run.recommendation ? 1 : 0),
          has_recommendation: run.recommendation != null,
        }),
      );
    }
    if (run.status === "AWAITING_APPROVAL" && run.recommendation) {
      const expired =
        run.recommendation.expiresAt != null &&
        Date.parse(run.recommendation.expiresAt) < Date.now();
      emitOnce(k("approval_view"), () =>
        analytics.track("approval_viewed", { quote_expired: expired }),
      );
    }
    if (run.status === "NO_VIABLE_OFFER") {
      emitOnce(k("cancelled"), () =>
        analytics.track("workflow_cancelled", { reason_code: "NO_VIABLE_OFFER" }),
      );
    }
    if (run.status === "FAILED") {
      emitOnce(k("exception"), () =>
        analytics.track("exception_viewed", { reason_code: run.error ? "run_failed" : undefined }),
      );
    }
  }, [run, analytics, emitOnce]);

  /**
   * Poll until the run settles. A dropped connection is not a failure — the
   * agent keeps working server-side — so this retries quietly and only surfaces
   * a problem after several consecutive misses.
   */
  const poll = useCallback(async (runId: string, attempt = 0, misses = 0) => {
    try {
      const view = await apiRequest<AgentRun>(`/api/agent/run/${runId}`, {
        sessionId: getSessionId(),
      });
      setRun(view);
      setReconnecting(false);
      if (view.status === "RUNNING" && attempt < MAX_POLLS) {
        pollRef.current = setTimeout(() => void poll(runId, attempt + 1, 0), POLL_MS);
      } else {
        setPhase("idle");
        if (view.status === "RUNNING") {
          setProblem({
            title: "This is taking longer than expected",
            body: "The agent is still working. Reload the page to pick the run back up.",
            restart: true,
          });
        }
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "NETWORK";
      // A transient network blip: keep the run, keep trying, say so quietly.
      if ((code === "NETWORK" || err instanceof TypeError) && misses < MAX_RECONNECTS) {
        setReconnecting(true);
        pollRef.current = setTimeout(
          () => void poll(runId, attempt + 1, misses + 1),
          POLL_MS * (misses + 2),
        );
        return;
      }
      setReconnecting(false);
      setPhase("idle");
      setProblem(await describe(code));
    }
  }, []);

  const beginRun = useCallback(
    async (body: Record<string, unknown>, nextPhase: Phase) => {
      stopPolling();
      setProblem(null);
      setDecidePending(null);
      setPhase(nextPhase);
      try {
        const view = await apiRequest<AgentRun>("/api/agent/run", {
          method: "POST",
          sessionId: getSessionId(),
          body,
        });
        setRun(view);
        setPhase("working");
        pollRef.current = setTimeout(() => void poll(view.runId), 700);
      } catch (err) {
        setPhase("idle");
        setProblem(await describe(err instanceof ApiError ? err.code : "NETWORK"));
      }
    },
    [poll, stopPolling],
  );

  const start = () => void beginRun({ request: request.trim() }, "starting");

  /**
   * A correction re-runs with the buyer's own values. The request text is
   * carried forward — they never retype it — and the corrected fields outrank
   * everything the parser or the model decided.
   */
  const correct = (correction: BriefCorrectionInput) =>
    void beginRun({ request: run?.request ?? request, correction }, "correcting");

  async function decide(decision: "ACCEPT" | "DECLINE", reason?: string) {
    if (!run?.recommendation) return;
    setDecidePending(decision);
    setPhase("deciding");
    setProblem(null);
    try {
      const view = await apiRequest<AgentRun>(`/api/agent/run/${run.runId}/approve`, {
        method: "POST",
        sessionId: getSessionId(),
        body: { decision, reason, offerFingerprint: run.recommendation.offerFingerprint },
      });
      setRun(view);
      if (view.status === "APPROVED") {
        analytics.track("approval_accepted", {
          pricing_model: view.recommendation?.priceBasis,
          quote_expired:
            view.recommendation?.expiresAt != null &&
            Date.parse(view.recommendation.expiresAt) < Date.now(),
        });
      } else if (view.status === "DECLINED") {
        analytics.track("approval_declined", { reason_given: Boolean(reason) });
      }
    } catch (err) {
      setProblem(await describe(err instanceof ApiError ? err.code : "NETWORK"));
    } finally {
      setDecidePending(null);
      setPhase("idle");
    }
  }

  function restart() {
    stopPolling();
    setRun(null);
    setProblem(null);
    setPhase("idle");
    announcedRef.current = null;
  }

  const busy = phase === "starting" || phase === "working" || phase === "correcting";
  const awaitingDecision = run?.status === "AWAITING_APPROVAL";
  const needsClarification = run?.status === "CLARIFICATION_NEEDED";

  return (
    <div className="space-y-5">
      {/* When embedded in the conversation, the thread is the only place to
          type — a second input box here would be a confusing dead end. */}
      {!embedded && (!run || (!busy && !awaitingDecision)) ? (
        <IntentInput
          value={request}
          onChange={setRequest}
          onSubmit={start}
          busy={busy}
          compact={run != null}
        />
      ) : null}

      {problem ? (
        <Callout tone="warning" title={problem.title}>
          <p>{problem.body}</p>
          {problem.restart ? (
            <Button size="sm" variant="secondary" className="mt-3" onClick={restart}>
              Start again
            </Button>
          ) : null}
        </Callout>
      ) : null}

      {run ? (
        <>
          {/* The single live-region: one sentence, not a stream of chatter. */}
          <p aria-live="polite" role="status" className="sr-only">
            {reconnecting ? "Reconnecting to the agent." : run.headline}
          </p>

          <Card as="section" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{busy ? run.headline : "How it went"}</CardTitle>
              {reconnecting ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-warning">
                  <Wifi aria-hidden className="size-3.5" />
                  Reconnecting…
                </span>
              ) : busy ? (
                <Loader2
                  aria-hidden
                  className="size-4 animate-spin text-primary motion-reduce:animate-none"
                />
              ) : null}
            </div>
            <StageList stages={run.stages} />
          </Card>

          {needsClarification && run.clarification ? (
            <Callout tone="info" title="One thing before I ask anyone">
              {run.clarification.question}
            </Callout>
          ) : null}

          {run.understanding ? (
            <UnderstandingCard
              understanding={run.understanding}
              missing={run.clarification?.missing ?? []}
              editable={!busy && run.decision == null}
              pending={phase === "correcting"}
              onCorrect={correct}
              startOpen={needsClarification}
            />
          ) : null}

          <div ref={decisionRef} tabIndex={-1} className="space-y-5 outline-none">
            {run.recommendation ? <RecommendationPanel run={run} /> : null}
            {awaitingDecision ? (
              <ApprovalPanel run={run} pending={decidePending} onDecide={decide} />
            ) : null}
          </div>

          <OutcomePanel run={run} onRestart={restart} />
          <ActivityFeed run={run} />
        </>
      ) : null}
    </div>
  );
}

async function describe(code: string) {
  const { requestErrorCopy } = await import("../run/copy");
  const copy = requestErrorCopy(code);
  return { title: copy.title, body: copy.body, restart: copy.offerRestart };
}

function IntentInput({
  value,
  onChange,
  onSubmit,
  busy,
  compact,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  compact: boolean;
}) {
  return (
    <Card as="section" className="space-y-3">
      <label htmlFor="agent-request" className="block text-base font-medium">
        {compact ? "Ask for something else" : "What do you need?"}
      </label>
      <textarea
        id="agent-request"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && value.trim()) {
            onSubmit();
          }
        }}
        rows={3}
        maxLength={2000}
        disabled={busy}
        placeholder="I need 500 A5 full-colour flyers before Friday, delivered to UNILAG main gate"
        aria-describedby="agent-request-hint"
        className="w-full rounded-md border border-border bg-bg px-3 py-2.5 text-base outline-none focus-visible:border-foreground disabled:opacity-60"
      />
      <p id="agent-request-hint" className="text-xs text-muted">
        Plain language is fine — I&apos;ll tell you if I need anything else.
      </p>

      {!compact ? (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => onChange(example.text)}
              disabled={busy}
              className="min-h-9 rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50"
            >
              {example.label}
            </button>
          ))}
        </div>
      ) : null}

      <Button onClick={onSubmit} pending={busy} disabled={!value.trim()}>
        <ArrowUp aria-hidden className="size-4" />
        {busy ? "Working…" : "Ask the agent"}
      </Button>

      <p className="text-xs text-subtle">
        Demo — this conversation is not saved. Nothing is ordered without your approval.
      </p>
    </Card>
  );
}
