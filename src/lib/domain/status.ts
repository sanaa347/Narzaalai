/**
 * Project workflow state machine. Pure and fully unit-tested.
 * Issuing a quote != approval; approval != purchase; installation != commissioning.
 */
export const PROJECT_STATUSES = [
  "SUBMITTED",
  "NEEDS_INFO",
  "ASSESSMENT",
  "QUOTE_REQUESTED",
  "PROPOSAL_READY",
  "APPROVED",
  "PROCUREMENT",
  "INSTALL_SCHEDULED",
  "INSTALLATION",
  "COMMISSIONING",
  "COMPLETED",
  "IN_SERVICE",
  "MAINTENANCE",
  "DELAYED",
  "CANCELLED",
  "REJECTED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TERMINAL_STATUSES: readonly ProjectStatus[] = ["CANCELLED", "REJECTED"];

/** Main path in order, for timelines. */
export const MAIN_PATH: readonly ProjectStatus[] = [
  "SUBMITTED",
  "ASSESSMENT",
  "QUOTE_REQUESTED",
  "PROPOSAL_READY",
  "APPROVED",
  "PROCUREMENT",
  "INSTALL_SCHEDULED",
  "INSTALLATION",
  "COMMISSIONING",
  "COMPLETED",
  "IN_SERVICE",
];

const NEXT: Record<ProjectStatus, readonly ProjectStatus[]> = {
  SUBMITTED: ["NEEDS_INFO", "ASSESSMENT", "CANCELLED", "REJECTED"],
  NEEDS_INFO: ["ASSESSMENT", "CANCELLED", "REJECTED"],
  ASSESSMENT: ["NEEDS_INFO", "QUOTE_REQUESTED", "CANCELLED", "REJECTED"],
  QUOTE_REQUESTED: ["PROPOSAL_READY", "ASSESSMENT", "DELAYED", "CANCELLED"],
  PROPOSAL_READY: ["APPROVED", "QUOTE_REQUESTED", "DELAYED", "CANCELLED", "REJECTED"],
  APPROVED: ["PROCUREMENT", "DELAYED", "CANCELLED"],
  PROCUREMENT: ["INSTALL_SCHEDULED", "DELAYED", "CANCELLED"],
  INSTALL_SCHEDULED: ["INSTALLATION", "DELAYED", "CANCELLED"],
  INSTALLATION: ["COMMISSIONING", "DELAYED"],
  COMMISSIONING: ["COMPLETED", "INSTALLATION", "DELAYED"],
  COMPLETED: ["IN_SERVICE", "MAINTENANCE"],
  IN_SERVICE: ["MAINTENANCE"],
  MAINTENANCE: ["IN_SERVICE"],
  DELAYED: [], // resolved dynamically: only back to resume_status, or CANCELLED
  CANCELLED: [],
  REJECTED: [],
};

/** Targets that cannot be reached through the generic "update status" action. */
export const WORKFLOW_ONLY_TARGETS: readonly ProjectStatus[] = ["APPROVED"];

export interface TransitionContext {
  resumeStatus?: ProjectStatus | null;
  hasPublishedProposal?: boolean;
  hasCommissioningEvidence?: boolean;
  /** True only when called from the recorded proposal-approval workflow. */
  viaApprovalWorkflow?: boolean;
  note?: string | null;
}

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export function allowedTargets(from: ProjectStatus, ctx: TransitionContext = {}): ProjectStatus[] {
  if (from === "DELAYED") {
    const out: ProjectStatus[] = ["CANCELLED"];
    if (ctx.resumeStatus && ctx.resumeStatus !== "DELAYED") out.unshift(ctx.resumeStatus);
    return out;
  }
  return [...NEXT[from]];
}

export function canTransition(from: ProjectStatus, to: ProjectStatus, ctx: TransitionContext = {}): TransitionResult {
  if (from === to) return { ok: false, reason: "Status is unchanged." };
  if (!allowedTargets(from, ctx).includes(to)) {
    return { ok: false, reason: `Transition ${from} → ${to} is not allowed.` };
  }
  // Resuming a DELAYED project restores the status it already had; it is not a new approval. (Without this, a project
  // delayed from APPROVED could never resume, only be cancelled.)
  const isResume = from === "DELAYED" && ctx.resumeStatus === to;
  if (WORKFLOW_ONLY_TARGETS.includes(to) && !ctx.viaApprovalWorkflow && !isResume) {
    return { ok: false, reason: "Approval must be recorded through the proposal approval workflow." };
  }
  if (to === "PROPOSAL_READY" && !ctx.hasPublishedProposal) {
    return { ok: false, reason: "Publish a proposal with at least one quotation before marking it ready." };
  }
  if (to === "COMPLETED" && !ctx.hasCommissioningEvidence) {
    return { ok: false, reason: "Upload a commissioning report or handover document before completing the project." };
  }
  if (["CANCELLED", "REJECTED", "DELAYED"].includes(to) && !(ctx.note && ctx.note.trim().length > 0)) {
    return { ok: false, reason: "A note explaining the reason is required." };
  }
  return { ok: true };
}

/** Customer-facing explanation of each status. Message keys live in i18n; this provides the stable key. */
export function statusKey(s: ProjectStatus): string {
  return `status.${s}`;
}
