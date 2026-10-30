import type { AttentionFlag } from "@/lib/domain/attention";
import type { OfferState } from "@/lib/domain/compare";
import type { ProjectStatus } from "@/lib/domain/status";
import { lab, type Locale } from "@/i18n";
import { Badge, type Tone } from "./primitives";

const STATUS_TONE: Record<ProjectStatus, Tone> = {
  SUBMITTED: "neutral",
  NEEDS_INFO: "warn",
  ASSESSMENT: "info",
  QUOTE_REQUESTED: "info",
  PROPOSAL_READY: "sun",
  APPROVED: "info",
  PROCUREMENT: "info",
  INSTALL_SCHEDULED: "info",
  INSTALLATION: "info",
  COMMISSIONING: "info",
  COMPLETED: "success",
  IN_SERVICE: "success",
  MAINTENANCE: "warn",
  DELAYED: "warn",
  CANCELLED: "danger",
  REJECTED: "danger",
};

export function StatusBadge({ status, lang = "mn" }: { status: ProjectStatus; lang?: Locale }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{lab(lang, "status", status)}</Badge>;
}

const OFFER_TONE: Record<OfferState, Tone> = {
  confirmed_offer: "success",
  expired: "danger",
  no_validity_date: "warn",
  indicative: "warn",
  demo: "demo",
  withdrawn: "danger",
};

/** Never shows an unconfirmed price as a current offer. */
export function OfferBadge({ state, lang = "mn" }: { state: OfferState; lang?: Locale }) {
  return <Badge tone={OFFER_TONE[state]}>{lab(lang, "offer", state)}</Badge>;
}

const FLAG_TONE: Record<AttentionFlag, Tone> = {
  overdue: "danger",
  blocked: "danger",
  delayed: "warn",
  open_info_request: "warn",
  missing_commissioning_evidence: "warn",
  unassigned: "neutral",
};

export function FlagBadge({ flag, lang = "en" }: { flag: AttentionFlag; lang?: Locale }) {
  return <Badge tone={FLAG_TONE[flag]}>{lab(lang, "attention", flag)}</Badge>;
}

export function VerificationBadge({ state, lang = "mn" }: { state: "preliminary" | "awaiting_verification" | "verified"; lang?: Locale }) {
  return <Badge tone={state === "verified" ? "success" : "warn"}>{lab(lang, "verification", state)}</Badge>;
}
