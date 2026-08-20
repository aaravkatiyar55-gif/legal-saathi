import type { CompletedAiRequestReceipt } from "./aiRequestReceipt.service";

export type AiRequestRecoveryState =
  | { status: "completed"; payload: Record<string, unknown> }
  | { status: "pending" }
  | { status: "missing" };

export type AiRequestDisconnectAction = "ignore" | "abort" | "continue_for_recovery";

/**
 * A dropped browser connection is not the same as the user's explicit Cancel
 * action. When durable receipts are enabled, finishing the bounded request is
 * what makes a completed answer recoverable without another provider charge.
 */
export function decideAiRequestDisconnectAction(input: {
  responseFinished: boolean;
  receiptRecoveryEnabled: boolean;
}): AiRequestDisconnectAction {
  if (input.responseFinished) return "ignore";
  return input.receiptRecoveryEnabled ? "continue_for_recovery" : "abort";
}

/**
 * Keeps timeout recovery explicit: callers never have to infer whether a
 * request is still running, has a recoverable result, or has no receipt.
 */
export function resolveAiRequestRecovery(input: {
  isActive: boolean;
  completedReceipt: CompletedAiRequestReceipt | null;
}): AiRequestRecoveryState {
  if (input.isActive) return { status: "pending" };
  if (input.completedReceipt) return { status: "completed", payload: input.completedReceipt.payload };
  return { status: "missing" };
}
