import { z } from "zod";
import type { Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { canApproveAsCustomer, isStaff } from "@/lib/auth/permissions";
import { DomainError } from "@/lib/domain/errors";
import { approvalBlocker } from "@/lib/domain/quote";
import { buildComparison, offerState, type Comparison, type CompareInput, type OfferState } from "@/lib/domain/compare";
import type { ProjectRow, ProposalOptionRow, ProposalRow, QuoteLineRow, QuoteRow } from "@/lib/db/types";
import { optText, parseInput, reqText } from "@/lib/validation/common";
import { actorLabel, requireStaffActor } from "./actors";
import { getComparisonInputs } from "./quotes";
import { addEvent, applyTransition, getProjectRow } from "./workflow";

const proposalSchema = z.object({
  title: reqText("Give the proposal a title", 200),
  summary: optText(3000),
  options: z
    .array(z.object({ quoteId: z.string().min(1), label: reqText("Each option needs a label", 120), customerSummary: optText(1500) }))
    .min(1, "Select at least one quotation"),
});

export function createProposalDraft(db: Db, actor: SessionUser | null, projectId: string, raw: unknown): string {
  const staff = requireStaffActor(actor);
  const project = getProjectRow(db, projectId);
  if (["CANCELLED", "REJECTED"].includes(project.status)) throw new DomainError("This project is closed.", "workflow");
  const v = parseInput(proposalSchema, raw);
  if (new Set(v.options.map((o) => o.quoteId)).size !== v.options.length) throw new DomainError("A quotation can only appear once in a proposal.");
  for (const o of v.options) {
    const q = db.prepare("SELECT * FROM quotes WHERE id = ?").get(o.quoteId) as QuoteRow | undefined;
    if (!q || q.project_id !== projectId) throw new DomainError("Every selected quotation must be linked to this project.");
    if (q.archived_at || q.status === "withdrawn") throw new DomainError(`Quotation ${q.reference} is withdrawn or archived.`);
    if (q.status === "draft") throw new DomainError(`Quotation ${q.reference} is still a draft. Mark it as received first.`);
  }
  const id = newId();
  db.transaction(() => {
    db.prepare("INSERT INTO proposals (id, project_id, title, summary, status, created_by) VALUES (?,?,?,?, 'draft', ?)").run(id, projectId, v.title, v.summary ?? null, staff.id);
    v.options.forEach((o, i) => {
      db.prepare("INSERT INTO proposal_options (id, proposal_id, quote_id, label, customer_summary, position) VALUES (?,?,?,?,?,?)").run(newId(), id, o.quoteId, o.label, o.customerSummary ?? null, i);
    });
  })();
  return id;
}

function getProposal(db: Db, id: string): ProposalRow {
  const p = db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as ProposalRow | undefined;
  if (!p) throw new DomainError("Proposal not found.", "not_found");
  return p;
}

export function publishProposal(db: Db, actor: SessionUser | null, proposalId: string): void {
  const staff = requireStaffActor(actor);
  const proposal = getProposal(db, proposalId);
  if (proposal.status !== "draft") throw new DomainError("Only a draft proposal can be published.", "workflow");
  const project = getProjectRow(db, proposal.project_id);
  if (project.status !== "QUOTE_REQUESTED" && project.status !== "PROPOSAL_READY") {
    throw new DomainError("Move the project to QUOTE_REQUESTED before publishing a proposal.", "workflow");
  }
  const opts = db.prepare("SELECT o.*, q.status AS q_status, q.archived_at AS q_archived FROM proposal_options o JOIN quotes q ON q.id = o.quote_id WHERE o.proposal_id = ?").all(proposalId) as (ProposalOptionRow & { q_status: string; q_archived: string | null })[];
  if (opts.length === 0) throw new DomainError("A proposal needs at least one quotation.");
  if (opts.some((o) => o.q_status !== "received" || o.q_archived)) throw new DomainError("A selected quotation is no longer available (withdrawn, draft or archived).", "workflow");
  const now = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE proposals SET status = 'withdrawn', updated_at = ? WHERE project_id = ? AND status = 'published' AND id <> ?").run(now, project.id, proposalId);
    db.prepare("UPDATE proposals SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?").run(now, now, proposalId);
    addEvent(db, { projectId: project.id, type: "PROPOSAL_PUBLISHED", actor: staff, note: `Proposal published: ${proposal.title}`, customerVisible: true, noteCustomerVisible: true });
    if (project.status === "QUOTE_REQUESTED") {
      applyTransition(db, getProjectRow(db, project.id), staff, { to: "PROPOSAL_READY", note: "Proposal published to customer", noteVisibleToCustomer: true });
    }
  })();
}

export function withdrawProposal(db: Db, actor: SessionUser | null, proposalId: string, note: string): void {
  const staff = requireStaffActor(actor);
  const proposal = getProposal(db, proposalId);
  if (proposal.status === "approved") throw new DomainError("An approved proposal cannot be withdrawn. Change the project status with a recorded note instead.", "workflow");
  if (proposal.status === "withdrawn") return;
  const project = getProjectRow(db, proposal.project_id);
  const reason = (note ?? "").trim();
  if (proposal.status === "published" && !reason) throw new DomainError("Record why a published proposal is being withdrawn.");
  db.transaction(() => {
    db.prepare("UPDATE proposals SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(nowIso(), proposalId);
    if (proposal.status === "published") {
      addEvent(db, { projectId: project.id, type: "NOTE", actor: staff, note: `Proposal withdrawn: ${proposal.title} — ${reason}`, customerVisible: true, noteCustomerVisible: true });
      const stillPublished = db.prepare("SELECT 1 FROM proposals WHERE project_id = ? AND status = 'published'").get(project.id);
      if (!stillPublished && project.status === "PROPOSAL_READY") {
        applyTransition(db, project, staff, { to: "QUOTE_REQUESTED", note: "Proposal withdrawn", noteVisibleToCustomer: false });
      }
    }
  })();
}

export interface ApproveOptions {
  note?: string | null;
  /** Staff recording an approval the customer gave outside the app. Requires a note naming the evidence. */
  onBehalfOfCustomer?: boolean;
  today?: Date;
}

export const APPROVAL_BLOCKER_TEXT: Record<string, string> = {
  withdrawn: "This quotation was withdrawn by the supplier or staff.",
  not_received: "This quotation has not been received/confirmed yet.",
  expired: "This quotation has expired. A new, dated quotation is needed before approval.",
  no_validity_date: "This quotation has no valid-until date, so it cannot be treated as a confirmed offer. Ask the supplier to confirm validity.",
  not_a_supplier_quotation: "Indicative or demo prices are not offers and cannot be approved.",
};

/**
 * Records the customer's approval of ONE option. This is the only way a project reaches APPROVED.
 * Approval is not a purchase: procurement is a separate, later status.
 */
export function approveProposal(db: Db, actor: SessionUser | null, proposalId: string, quoteId: string, opts: ApproveOptions = {}): void {
  if (!actor) throw new DomainError("Нэвтэрнэ үү.", "forbidden");
  const proposal = getProposal(db, proposalId);
  const project = getProjectRow(db, proposal.project_id);
  const onBehalf = !!opts.onBehalfOfCustomer;
  if (onBehalf) {
    if (!isStaff(actor)) throw new DomainError("Only staff can record an approval on behalf of a customer.", "forbidden");
    if (!opts.note?.trim()) throw new DomainError("Record the evidence of the customer's approval (e.g. signed agreement received by email, date).");
  } else if (!canApproveAsCustomer(actor, project.org_id)) {
    throw new DomainError("Санал олдсонгүй.", "not_found"); // do not reveal other customers' proposals
  }
  if (proposal.status !== "published") throw new DomainError("Энэ санал одоогоор батлах боломжгүй байна.", "workflow");
  if (project.status !== "PROPOSAL_READY") throw new DomainError("Төслийн төлөв санал батлахад тохирохгүй байна.", "workflow");
  const option = db.prepare("SELECT * FROM proposal_options WHERE proposal_id = ? AND quote_id = ?").get(proposalId, quoteId) as ProposalOptionRow | undefined;
  if (!option) throw new DomainError("Сонгосон хувилбар энэ саналд ороогүй байна.", "invalid");
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(quoteId) as QuoteRow;
  const blocker = approvalBlocker({ sourceType: quote.source_type, status: quote.status, validUntil: quote.valid_until }, project.is_demo === 1, opts.today ?? new Date());
  if (blocker) throw new DomainError(APPROVAL_BLOCKER_TEXT[blocker] ?? "This option cannot be approved.", "workflow");

  const label = onBehalf ? `${actorLabel(actor)} (recorded on behalf of customer)` : actorLabel(actor);
  const now = nowIso();
  const summary = {
    quoteId: quote.id, quoteReference: quote.reference, supplierId: quote.supplier_id, sourceType: quote.source_type, currency: quote.currency,
    totalMinor: quote.total_minor, equipmentSubtotalMinor: quote.equipment_subtotal_minor, installationMinor: quote.installation_minor,
    deliveryMinor: quote.delivery_minor, taxesMinor: quote.taxes_minor, otherChargesMinor: quote.other_charges_minor, approvedAt: now,
  };
  db.transaction(() => {
    db.prepare(
      `UPDATE proposals SET status='approved', approved_quote_id=?, approved_by=?, approved_by_label=?, approved_at=?, approval_note=?, updated_at=? WHERE id=?`,
    ).run(quoteId, actor.id, label, now, opts.note?.trim() || null, now, proposalId);
    db.prepare("UPDATE proposals SET status='withdrawn', updated_at=? WHERE project_id=? AND id<>? AND status='published'").run(now, project.id, proposalId);
    db.prepare("UPDATE projects SET approved_proposal_id=?, financial_summary=?, updated_at=? WHERE id=?").run(proposalId, JSON.stringify(summary), now, project.id);
    addEvent(db, {
      projectId: project.id, type: "PROPOSAL_APPROVED", actor, actorLabelOverride: label, customerVisible: true, noteCustomerVisible: true,
      note: `Approved option "${option.label}" (quotation ${quote.reference}). Approval is not a purchase: procurement is recorded separately.${opts.note?.trim() ? ` ${opts.note.trim()}` : ""}`,
    });
    applyTransition(db, getProjectRow(db, project.id), actor, { to: "APPROVED", viaApprovalWorkflow: true, note: "Proposal approved", noteVisibleToCustomer: true });
  })();
}

export interface ProposalOptionView {
  option: ProposalOptionRow;
  quote: CompareInput;
  offer: OfferState;
  approvalBlocker: string | null;
  lines: { description: string; manufacturer: string | null; model: string | null; quantity: number; unit_price_minor: number; line_total_minor: number }[];
}

export interface ProposalView {
  proposal: ProposalRow;
  options: ProposalOptionView[];
  comparison: Comparison;
}

function buildViews(db: Db, proposals: ProposalRow[], project: ProjectRow, today: Date): ProposalView[] {
  return proposals.map((proposal) => {
    const options = db.prepare("SELECT * FROM proposal_options WHERE proposal_id = ? ORDER BY position").all(proposal.id) as ProposalOptionRow[];
    const inputs = getComparisonInputs(db, options.map((o) => o.quote_id));
    const views: ProposalOptionView[] = options.flatMap((option) => {
      const quote = inputs.find((i) => i.id === option.quote_id);
      if (!quote) return [];
      const q = db.prepare("SELECT source_type, status, valid_until FROM quotes WHERE id = ?").get(option.quote_id) as { source_type: QuoteRow["source_type"]; status: string; valid_until: string | null };
      const lines = db
        .prepare("SELECT description, manufacturer, model, quantity, unit_price_minor, line_total_minor FROM quote_line_items WHERE quote_id = ? ORDER BY position")
        .all(option.quote_id) as QuoteLineRow[];
      return [{
        option, quote, offer: offerState(quote, today),
        approvalBlocker: approvalBlocker({ sourceType: q.source_type, status: q.status, validUntil: q.valid_until }, project.is_demo === 1, today), lines,
      }];
    });
    return { proposal, options: views, comparison: buildComparison(views.map((v) => v.quote), today) };
  });
}

/** Staff view: every proposal including drafts. */
export function listProposalsForOps(db: Db, projectId: string, today = new Date()): ProposalView[] {
  const project = getProjectRow(db, projectId);
  const proposals = db.prepare("SELECT * FROM proposals WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as ProposalRow[];
  return buildViews(db, proposals, project, today);
}

/** Customer view: only published/approved proposals of an organization they belong to. Internal notes are never selected. */
export function listProposalsForCustomer(db: Db, actor: SessionUser, projectId: string, today = new Date()): ProposalView[] {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
  if (!project || !canApproveAsCustomer(actor, project.org_id)) return [];
  const proposals = db.prepare("SELECT * FROM proposals WHERE project_id = ? AND status IN ('published','approved') ORDER BY created_at DESC").all(projectId) as ProposalRow[];
  return buildViews(db, proposals, project, today);
}
