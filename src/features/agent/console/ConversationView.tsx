"use client";

import { useRef, useState } from "react";

import { ArrowUp, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, apiRequest } from "@/lib/api";
import { getSessionId } from "@/lib/session";

import { AgentConsole } from "./AgentConsole";
import type { AgentRun } from "./types";

/**
 * One continuous conversation (milestone 6 §23–§27; milestone 7 §6–§9).
 *
 * A normal assistant first: the person types, the assistant replies. Only when
 * there is real, complete commercial intent does the structured buyer-agent run
 * appear — inline, in the same thread. "Start a new request" deliberately
 * forgets the conversation so a fresh request never inherits an old brief; it
 * does not touch any order the person already has.
 */

interface Understood {
  category?: string;
  service?: string;
  quantity?: number;
  size?: string;
  colour?: string;
  location?: string;
  deadline?: { phrase: string; iso: string | null };
  budget?: { amount: number; currency: string };
  condition?: string;
}

interface TurnResponse {
  message: string;
  intent: string;
  understood: Understood;
  optimizationNote: string | null;
  action: { kind: string; missing?: string[]; category?: string };
  run?: AgentRun;
}

interface Message {
  id: string;
  role: "you" | "assistant";
  text: string;
  note?: string | null;
  run?: AgentRun;
}

const CHIP_LABEL: Record<string, (u: Understood) => string | null> = {
  service: (u) => u.service ?? u.category ?? null,
  quantity: (u) => (u.quantity ? `${u.quantity.toLocaleString()}` : null),
  size: (u) => u.size ?? null,
  colour: (u) => u.colour ?? null,
  deadline: (u) => u.deadline?.phrase ?? null,
  location: (u) => u.location ?? null,
  budget: (u) => (u.budget ? `${u.budget.currency} ${u.budget.amount.toLocaleString()}` : null),
  condition: (u) => u.condition ?? null,
};

function summariseUnderstanding(u: Understood): string[] {
  return Object.values(CHIP_LABEL)
    .map((fn) => fn(u))
    .filter((v): v is string => Boolean(v));
}

const INTRO: Message = {
  id: "intro",
  role: "assistant",
  text: "Hi — tell me what you need and I'll find a business on Intra that can do it, get you a real price, and let you decide. I never send an order or pay for you.",
};

export function ConversationView() {
  const [messages, setMessages] = useState<Message[]>([INTRO]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState<Understood>({});
  const endRef = useRef<HTMLDivElement | null>(null);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setError(null);
    setPending(true);
    const mine: Message = { id: `u-${Date.now()}`, role: "you", text };
    setMessages((prev) => [...prev, mine]);

    try {
      const res = await apiRequest<TurnResponse>("/api/conversation", {
        method: "POST",
        sessionId: getSessionId(),
        body: { message: text },
      });
      setUnderstood(res.understood ?? {});
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: res.message,
          note: res.optimizationNote,
          run: res.run,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again in a moment.",
      );
      setMessages((prev) => prev.filter((m) => m.id !== mine.id));
      setDraft(text);
    } finally {
      setPending(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  async function startOver() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiRequest<{ reset: true; message: string }>("/api/conversation", {
        method: "POST",
        sessionId: getSessionId(),
        body: { reset: true },
      });
      setMessages([{ ...INTRO, text: res.message }]);
      setUnderstood({});
      setDraft("");
    } catch {
      // Even if the call fails, clearing the thread locally is the safe outcome.
      setMessages([INTRO]);
      setUnderstood({});
    } finally {
      setPending(false);
    }
  }

  const chips = summariseUnderstanding(understood);
  const started = messages.some((m) => m.role === "you");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Callout tone="info" className="flex-1">
          Demo only — nothing here is saved.
        </Callout>
        {started ? (
          <button
            type="button"
            onClick={() => void startOver()}
            disabled={pending}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Start a new request
          </button>
        ) : null}
      </div>

      <div className="space-y-4" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className="space-y-3">
            <div
              className={
                message.role === "you"
                  ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-contrast"
                  : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm bg-surface px-4 py-2.5 text-sm"
              }
            >
              {message.text}
              {message.note ? (
                <span className="mt-1.5 block text-xs text-muted">{message.note}</span>
              ) : null}
            </div>
            {message.run ? (
              <AgentConsole key={message.run.runId} initialRun={message.run} embedded />
            ) : null}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>So far:</span>
          {chips.map((chip) => (
            <span key={chip} className="rounded-full border border-border px-2 py-0.5">
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="conversation-input" className="sr-only">
          Message
        </label>
        <textarea
          id="conversation-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="e.g. I need 500 flyers by Friday in Yaba"
          className="min-h-11 w-full resize-none rounded-md border border-border bg-bg px-3 py-2.5 text-base outline-none focus-visible:border-foreground"
        />
        <Button type="submit" pending={pending} aria-label="Send" className="w-auto shrink-0 px-4">
          <ArrowUp aria-hidden className="size-4" />
        </Button>
      </form>
    </div>
  );
}
