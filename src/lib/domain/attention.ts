import { localDate } from "./dates";
import { TERMINAL_STATUSES, type ProjectStatus } from "./status";

export type AttentionFlag = "overdue" | "blocked" | "delayed" | "open_info_request" | "missing_commissioning_evidence" | "unassigned";

export interface AttentionInput {
  status: ProjectStatus;
  nextActionDue: string | null; // ISO date (YYYY-MM-DD)
  blockedReason: string | null;
  assignedTo: string | null;
  openInfoRequests: number;
  hasCommissioningEvidence: boolean;
}

const QUIET: readonly ProjectStatus[] = [...TERMINAL_STATUSES, "IN_SERVICE", "MAINTENANCE"];

/** Lets the operations team spot overdue, blocked and incomplete projects. Pure; `today` is injectable for tests. */
export function attentionFlags(p: AttentionInput, today = new Date()): AttentionFlag[] {
  const flags: AttentionFlag[] = [];
  const todayIso = localDate(today);
  const active = !QUIET.includes(p.status);
  if (active && p.nextActionDue && p.nextActionDue < todayIso) flags.push("overdue");
  if (p.blockedReason && p.blockedReason.trim() && !TERMINAL_STATUSES.includes(p.status)) flags.push("blocked");
  if (p.status === "DELAYED") flags.push("delayed");
  if (p.openInfoRequests > 0 && !TERMINAL_STATUSES.includes(p.status)) flags.push("open_info_request");
  if ((p.status === "COMMISSIONING" || p.status === "COMPLETED") && !p.hasCommissioningEvidence) flags.push("missing_commissioning_evidence");
  if (active && !p.assignedTo) flags.push("unassigned");
  return flags;
}
