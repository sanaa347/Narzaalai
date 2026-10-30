import { localDatePlusDays } from "@/lib/domain/dates";
import type { Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { canViewOrgData } from "@/lib/auth/permissions";
import { DomainError } from "@/lib/domain/errors";
import { canTransition, type ProjectStatus } from "@/lib/domain/status";
import type { AssessmentRow, DocumentRow, InfoRequestRow, ProjectRow } from "@/lib/db/types";
import { actorLabel, requireStaffActor } from "./actors";
import { COMMISSIONING_DOC_TYPES } from "./projects";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanText = (v: string | null | undefined, max = 4000): string | null => {
  const t = (v ?? "").trim();
  if (t.length > max) throw new DomainError(`Text is too long (max ${max} characters).`);
  return t === "" ? null : t;
};
const validDate = (v: string | null | undefined, label: string): string | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  if (!ISO_DATE.test(t) || Number.isNaN(Date.parse(t))) throw new DomainError(`${label}: invalid date (use YYYY-MM-DD).`);
  return t;
};

export interface EventInput {
  projectId: string;
  type: "SUBMITTED" | "STATUS_CHANGE" | "NOTE" | "INFO_REQUESTED" | "INFO_PROVIDED" | "PROPOSAL_PUBLISHED" | "PROPOSAL_APPROVED" | "MILESTONE" | "DOCUMENT" | "ASSIGNED";
  actor: SessionUser | null;
  actorLabelOverride?: string;
  previous?: ProjectStatus | null;
  next?: ProjectStatus | null;
  note?: string | null;
  documentId?: string | null;
  customerVisible?: boolean;
  noteCustomerVisible?: boolean;
}

export function addEvent(db: Db, e: EventInput): string {
  const id = newId();
  db.prepare(
    `INSERT INTO project_events (id, project_id, event_type, previous_status, new_status, note, actor_id, actor_label, document_id,
      customer_visible, note_customer_visible, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, e.projectId, e.type, e.previous ?? null, e.next ?? null, e.note ?? null, e.actor?.id ?? null,
    e.actorLabelOverride ?? (e.actor ? actorLabel(e.actor) : "System"), e.documentId ?? null,
    e.customerVisible === false ? 0 : 1, e.noteCustomerVisible ? 1 : 0, nowIso(),
  );
  return id;
}

export function getProjectRow(db: Db, id: string): ProjectRow {
  const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  if (!p) throw new DomainError("Project not found.", "not_found");
  return p;
}

function projectDocument(db: Db, projectId: string, documentId: string | null | undefined): DocumentRow | null {
  if (!documentId) return null;
  const d = db.prepare("SELECT * FROM documents WHERE id = ? AND project_id = ?").get(documentId, projectId) as DocumentRow | undefined;
  if (!d) throw new DomainError("The selected document does not belong to this project.", "invalid");
  return d;
}

export interface TransitionOptions {
  to: ProjectStatus;
  note?: string | null;
  noteVisibleToCustomer?: boolean;
  documentId?: string | null;
  viaApprovalWorkflow?: boolean;
  nextActionDue?: string | null;
}

/**
 * The single place where a project's status changes. Validates against the state machine, updates the project and writes
 * the audit event in one transaction. Callers are responsible for authorization before calling.
 */
export function applyTransition(db: Db, project: ProjectRow, who: SessionUser, opts: TransitionOptions): void {
  const note = cleanText(opts.note);
  const doc = projectDocument(db, project.id, opts.documentId);
  const hasPublishedProposal = !!db
    .prepare(
      `SELECT 1 FROM proposals p WHERE p.project_id = ? AND p.status IN ('published','approved')
       AND EXISTS (SELECT 1 FROM proposal_options o WHERE o.proposal_id = p.id) LIMIT 1`,
    )
    .get(project.id);
  const marks = COMMISSIONING_DOC_TYPES.map(() => "?").join(",");
  const hasCommissioningEvidence =
    !!db.prepare(`SELECT 1 FROM documents WHERE project_id = ? AND doc_type IN (${marks}) LIMIT 1`).get(project.id, ...COMMISSIONING_DOC_TYPES) ||
    (!!doc && (COMMISSIONING_DOC_TYPES as readonly string[]).includes(doc.doc_type));

  const verdict = canTransition(project.status, opts.to, {
    resumeStatus: project.resume_status,
    hasPublishedProposal,
    hasCommissioningEvidence,
    viaApprovalWorkflow: opts.viaApprovalWorkflow,
    note,
  });
  if (!verdict.ok) throw new DomainError(verdict.reason, "workflow");

  const nextDue = validDate(opts.nextActionDue ?? null, "Next action due");
  const resume = opts.to === "DELAYED" ? project.status : null;
  const now = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE projects SET status = ?, resume_status = ?, next_action_due = ?, updated_at = ? WHERE id = ?").run(
      opts.to, resume, nextDue, now, project.id,
    );
    addEvent(db, {
      projectId: project.id, type: "STATUS_CHANGE", actor: who, previous: project.status, next: opts.to, note,
      documentId: doc?.id ?? null, customerVisible: true, noteCustomerVisible: !!opts.noteVisibleToCustomer,
    });
  })();
}

export function changeStatus(db: Db, actor: SessionUser | null, projectId: string, opts: TransitionOptions): void {
  const staff = requireStaffActor(actor);
  const project = getProjectRow(db, projectId);
  if (opts.viaApprovalWorkflow) throw new DomainError("Approval can only be recorded through the proposal approval workflow.", "workflow");
  applyTransition(db, project, staff, opts);
}

export function addInternalNote(db: Db, actor: SessionUser | null, assessmentId: string, body: string): void {
  const staff = requireStaffActor(actor);
  const text = cleanText(body, 4000);
  if (!text) throw new DomainError("The note cannot be empty.");
  const a = db.prepare("SELECT id FROM assessments WHERE id = ?").get(assessmentId);
  if (!a) throw new DomainError("Assessment not found.", "not_found");
  db.prepare("INSERT INTO assessment_notes (id, assessment_id, author_id, body) VALUES (?,?,?,?)").run(newId(), assessmentId, staff.id, text);
}

export function setVerificationState(db: Db, actor: SessionUser | null, assessmentId: string, state: AssessmentRow["verification_state"], note: string): void {
  const staff = requireStaffActor(actor);
  if (!["preliminary", "awaiting_verification", "verified"].includes(state)) throw new DomainError("Invalid state.");
  const n = cleanText(note);
  if (state === "verified" && !n) throw new DomainError("To mark an assessment as verified, record what verification was done in the note.");
  const a = db.prepare("SELECT * FROM assessments WHERE id = ?").get(assessmentId) as AssessmentRow | undefined;
  if (!a) throw new DomainError("Assessment not found.", "not_found");
  const p = db.prepare("SELECT id FROM projects WHERE assessment_id = ?").get(assessmentId) as { id: string } | undefined;
  db.transaction(() => {
    db.prepare("UPDATE assessments SET verification_state = ?, updated_at = ? WHERE id = ?").run(state, nowIso(), assessmentId);
    if (p) addEvent(db, { projectId: p.id, type: "NOTE", actor: staff, note: `Assessment verification: ${a.verification_state} → ${state}${n ? ` — ${n}` : ""}`, customerVisible: false });
  })();
}

export function requestInfo(db: Db, actor: SessionUser | null, projectId: string, message: string): void {
  const staff = requireStaffActor(actor);
  const msg = cleanText(message, 2000);
  if (!msg) throw new DomainError("Write what you need to ask the customer.");
  const project = getProjectRow(db, projectId);
  if (["CANCELLED", "REJECTED"].includes(project.status)) throw new DomainError("Cannot request information on a closed project.", "workflow");
  db.transaction(() => {
    db.prepare("INSERT INTO info_requests (id, project_id, message, requested_by) VALUES (?,?,?,?)").run(newId(), projectId, msg, staff.id);
    addEvent(db, { projectId, type: "INFO_REQUESTED", actor: staff, note: msg, customerVisible: true, noteCustomerVisible: true });
    if (project.status === "SUBMITTED" || project.status === "ASSESSMENT") {
      applyTransition(db, project, staff, { to: "NEEDS_INFO", note: "Нэмэлт мэдээлэл хүссэн", noteVisibleToCustomer: true });
    }
  })();
}

export function answerInfoRequest(db: Db, actor: SessionUser | null, infoRequestId: string, response: string): void {
  if (!actor || actor.role !== "customer") throw new DomainError("Зөвхөн хэрэглэгч хариулах боломжтой.", "forbidden");
  const ir = db.prepare("SELECT * FROM info_requests WHERE id = ?").get(infoRequestId) as InfoRequestRow | undefined;
  if (!ir) throw new DomainError("Хүсэлт олдсонгүй.", "not_found");
  const project = getProjectRow(db, ir.project_id);
  if (!canViewOrgData(actor, project.org_id)) throw new DomainError("Хүсэлт олдсонгүй.", "not_found"); // do not reveal existence
  if (ir.status !== "open") throw new DomainError("Энэ хүсэлтэд аль хэдийн хариулсан байна.", "conflict");
  const text = cleanText(response, 4000);
  if (!text) throw new DomainError("Хариултаа бичнэ үү.");
  db.transaction(() => {
    db.prepare("UPDATE info_requests SET status = 'answered', response = ?, answered_at = ? WHERE id = ?").run(text, nowIso(), ir.id);
    addEvent(db, { projectId: project.id, type: "INFO_PROVIDED", actor, note: text, customerVisible: true, noteCustomerVisible: true });
    const open = (db.prepare("SELECT COUNT(*) AS n FROM info_requests WHERE project_id = ? AND status = 'open'").get(project.id) as { n: number }).n;
    const fresh = getProjectRow(db, project.id);
    if (open === 0 && fresh.status === "NEEDS_INFO") {
      const due = localDatePlusDays(2);
      applyTransition(db, fresh, actor, { to: "ASSESSMENT", note: "Хэрэглэгч мэдээллээ өглөө", noteVisibleToCustomer: true, nextActionDue: due });
    }
  })();
}

export function closeInfoRequest(db: Db, actor: SessionUser | null, infoRequestId: string): void {
  requireStaffActor(actor);
  db.prepare("UPDATE info_requests SET status = 'closed' WHERE id = ? AND status = 'open'").run(infoRequestId);
}

export function assignOwner(db: Db, actor: SessionUser | null, projectId: string, userId: string | null): void {
  const staff = requireStaffActor(actor);
  const project = getProjectRow(db, projectId);
  let name = "unassigned";
  if (userId) {
    const u = db.prepare("SELECT id, full_name FROM users WHERE id = ? AND role IN ('staff','admin') AND status = 'active'").get(userId) as { id: string; full_name: string } | undefined;
    if (!u) throw new DomainError("The owner must be an active staff member.");
    name = u.full_name;
  }
  db.transaction(() => {
    db.prepare("UPDATE projects SET assigned_to = ?, updated_at = ? WHERE id = ?").run(userId, nowIso(), projectId);
    db.prepare("UPDATE assessments SET assigned_to = ?, updated_at = ? WHERE id = ?").run(userId, nowIso(), project.assessment_id);
    addEvent(db, { projectId, type: "ASSIGNED", actor: staff, note: `Owner → ${name}`, customerVisible: false });
  })();
}

export interface ScheduleInput {
  scheduledInstallDate?: string | null;
  scheduleNotes?: string | null;
  nextActionDue?: string | null;
  blockedReason?: string | null;
}

export function updateSchedule(db: Db, actor: SessionUser | null, projectId: string, input: ScheduleInput): void {
  const staff = requireStaffActor(actor);
  const project = getProjectRow(db, projectId);
  const install = validDate(input.scheduledInstallDate, "Installation date");
  const due = validDate(input.nextActionDue, "Next action due");
  const notes = cleanText(input.scheduleNotes, 2000);
  const blocked = cleanText(input.blockedReason, 1000);
  const installChanged = install !== project.scheduled_install_date;
  db.transaction(() => {
    db.prepare(
      "UPDATE projects SET scheduled_install_date = ?, schedule_notes = ?, next_action_due = ?, blocked_reason = ?, updated_at = ? WHERE id = ?",
    ).run(install, notes, due, blocked, nowIso(), projectId);
    addEvent(db, {
      projectId, type: "MILESTONE", actor: staff, customerVisible: installChanged && !!install, noteCustomerVisible: installChanged && !!install,
      note: installChanged
        ? install
          ? `Суурилуулалтын төлөвлөсөн огноо: ${install} (урьдчилсан төлөвлөгөө — баталгаат амлалт биш)`
          : "Суурилуулалтын төлөвлөсөн огноог цуцалсан"
        : "Schedule / blocker updated",
    });
  })();
}

export function recordMilestone(
  db: Db, actor: SessionUser | null, projectId: string,
  input: { title: string; note?: string | null; documentId?: string | null; customerVisible?: boolean },
): void {
  const staff = requireStaffActor(actor);
  getProjectRow(db, projectId);
  const title = cleanText(input.title, 200);
  if (!title) throw new DomainError("Enter a milestone title.");
  const note = cleanText(input.note, 2000);
  const doc = projectDocument(db, projectId, input.documentId);
  addEvent(db, {
    projectId, type: "MILESTONE", actor: staff, note: note ? `${title} — ${note}` : title, documentId: doc?.id ?? null,
    customerVisible: !!input.customerVisible, noteCustomerVisible: !!input.customerVisible,
  });
}
