"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { TextField } from "@/components/ui/TextField";
import { useAnalytics } from "@/features/analytics/useAnalytics";
import { ApiError, apiRequest } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { easExplorerUrl } from "@/features/attestation/chain";
import { HandoverCodeCard } from "@/features/attestation/HandoverCodeCard";
import "@/features/payments/minipay/provider";

export interface HandoverPublicView {
  status: "PENDING_CODE" | "PENDING_SIGNATURE" | "ATTESTED" | "ATTESTATION_FAILED";
  provider: string;
  outcome: string | null;
  fulfilledAt: string | null;
  attestationUid: string | null;
  attestationTxHash: string | null;
  attestationMode: "mock" | "onchain" | null;
  simulated: boolean;
}

type Stage = "code" | "connecting" | "signing" | "submitting";

/**
 * Merchant side of the two-party handover attestation (ADR-018, milestone 9).
 * The wording stays plain throughout ("Confirm that this job was handed
 * over") — the wallet signature underneath is real, but nothing here names a
 * schema, a transaction hash, or Solidity (M9 §8). Those live in the
 * technical evidence view only.
 */
export function HandoverAttestPanel({
  taskId,
  manageToken,
  handover,
}: {
  taskId: string;
  manageToken: string;
  handover: HandoverPublicView | null;
}) {
  const router = useRouter();
  const analytics = useAnalytics("business");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = handover?.status ?? "PENDING_CODE";

  async function signAndSubmit() {
    setError(null);
    analytics.track("handover_started", {});
    if (!window.ethereum) {
      setError(
        "This needs a wallet in this browser (like MetaMask or Valora) to confirm the handover. " +
          "Open this page in a browser or app with one installed.",
      );
      return;
    }

    try {
      setStage("code");
      const signRequest = await apiRequest<{ typedData: unknown; deadline: string }>(
        `/api/tasks/${taskId}/handover/sign-request`,
        { method: "POST", manageToken, body: { code } },
      );

      setStage("connecting");
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const account = accounts[0];
      const typedData = signRequest.typedData as { message: { attester: string } };
      if (!account || account.toLowerCase() !== typedData.message.attester.toLowerCase()) {
        throw new Error(
          "Connect the wallet for this business's on-file payout address to confirm this handover.",
        );
      }

      setStage("signing");
      const signature = await window.ethereum.request({
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify(signRequest.typedData)],
      });

      setStage("submitting");
      const result = await apiRequest<{ attestationMode?: "mock" | "onchain" | null }>(
        `/api/tasks/${taskId}/handover/submit`,
        {
          method: "POST",
          manageToken,
          body: { signature },
        },
      );
      analytics.track("handover_completed", {
        mode: result.attestationMode === "onchain" ? "onchain" : "mock",
      });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't record that. Please try again.",
      );
    } finally {
      setStage(null);
    }
  }

  if (status === "ATTESTED") {
    const explorer = handover?.attestationUid ? easExplorerUrl(handover.attestationUid) : null;
    return (
      <Callout tone="success" title="Handover confirmed">
        Recorded{handover?.fulfilledAt ? ` on ${formatDateTime(handover.fulfilledAt)}` : ""}.
        {handover?.simulated ? " (Simulated — not on any real network.)" : null}
        {explorer && !handover?.simulated ? (
          <>
            {" "}
            <a href={explorer} target="_blank" rel="noreferrer" className="underline">
              View the record
            </a>
            .
          </>
        ) : null}
      </Callout>
    );
  }

  return (
    <HandoverCodeCard mode="merchant">
      <TextField
        label="Code from the customer"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        autoCapitalize="characters"
        inputMode="text"
      />
      <Button size="sm" pending={stage !== null} onClick={signAndSubmit}>
        {stage === "connecting"
          ? "Connecting wallet…"
          : stage === "signing"
            ? "Waiting for your wallet…"
            : stage === "submitting"
              ? "Recording…"
              : "Confirm handover"}
      </Button>
      {status === "ATTESTATION_FAILED" ? (
        <p className="text-xs text-danger">
          That didn&apos;t go through. You can try again without re-asking for the code.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </HandoverCodeCard>
  );
}
