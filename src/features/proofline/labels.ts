import type { ProoflineConfirmationMethod, ProoflineEventType } from "./status";

export const PROOFLINE_EVENT_LABEL: Record<ProoflineEventType, string> = {
  READY_FOR_PICKUP: "Printer marked the order ready for pickup",
  PICKUP_CONFIRMED: "Buyer confirmed they collected the order",
};

export const PROOFLINE_METHOD_LABEL: Record<ProoflineConfirmationMethod, string> = {
  merchant_manage_token: "printer, via their manage link",
  buyer_session: "buyer, from their own request link",
  one_time_code: "buyer, using the one-time pickup code",
};
