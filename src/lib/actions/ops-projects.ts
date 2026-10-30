"use server";

import { runAction } from "./run";
import type { FormState } from "./state";
import type { ProjectStatus } from "@/lib/domain/status";
import { addInternalNote, assignOwner, changeStatus, closeInfoRequest, recordMilestone, requestInfo, setVerificationState, updateSchedule } from "@/lib/services/workflow";
import { approveProposal, createProposalDraft, publishProposal, withdrawProposal } from "@/lib/services/proposals";
import { saveDocument, setDocumentAccess } from "@/lib/services/documents";
import { addAsset, addWarranty, createServiceTicket, updateServiceTicket } from "@/lib/services/assets";
import { DomainError } from "@/lib/domain/errors";

export async function assignOwnerAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  assignOwner(c.db, c.actor, c.str("projectId"), c.opt("userId") ?? null);
  return "Owner updated.";
  });
}

export async function updateScheduleAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  updateSchedule(c.db, c.actor, c.str("projectId"), {
    scheduledInstallDate: c.str("scheduledInstallDate"), scheduleNotes: c.str("scheduleNotes"),
    nextActionDue: c.str("nextActionDue"), blockedReason: c.str("blockedReason"),
  });
  return "Schedule saved.";
  });
}

export async function changeStatusAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  const to = c.str("to");
  if (!to) throw new DomainError("Choose the new status.", "invalid", { to: "Choose the new status" });
  changeStatus(c.db, c.actor, c.str("projectId"), {
    to: to as ProjectStatus, note: c.str("note") || null, noteVisibleToCustomer: c.form.get("noteVisible") === "on",
    documentId: c.opt("documentId") ?? null, nextActionDue: c.opt("nextActionDue") ?? undefined,
  });
  return `Status changed to ${to}.`;
  });
}

export async function recordMilestoneAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  recordMilestone(c.db, c.actor, c.str("projectId"), {
    title: c.str("title"), note: c.str("note"), documentId: c.opt("documentId") ?? null, customerVisible: c.form.get("customerVisible") === "on",
  });
  return "Milestone recorded.";
  });
}

export async function requestInfoAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  requestInfo(c.db, c.actor, c.str("projectId"), c.str("message"));
  return "Request sent to the customer.";
  });
}

export async function closeInfoRequestAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  closeInfoRequest(c.db, c.actor, c.str("infoRequestId"));
  return "Request closed.";
  });
}

export async function setVerificationAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  setVerificationState(c.db, c.actor, c.str("assessmentId"), c.str("state") as "preliminary" | "awaiting_verification" | "verified", c.str("note"));
  return "Verification state updated.";
  });
}

export async function addNoteAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  addInternalNote(c.db, c.actor, c.str("assessmentId"), c.str("body"));
  return "Internal note added.";
  });
}

export async function createProposalAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  const ids = c.all("quoteId");
  const options = ids.map((quoteId) => ({ quoteId, label: c.str(`label_${quoteId}`), customerSummary: c.str(`summary_${quoteId}`) }));
  createProposalDraft(c.db, c.actor, c.str("projectId"), { title: c.str("title"), summary: c.str("summary"), options });
  return "Draft proposal created. Review it below, then publish it to the customer.";
  });
}

export async function publishProposalAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  publishProposal(c.db, c.actor, c.str("proposalId"));
  return "Proposal published to the customer.";
  });
}

export async function withdrawProposalAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  withdrawProposal(c.db, c.actor, c.str("proposalId"), c.str("note"));
  return "Proposal withdrawn.";
  });
}

export async function approveOnBehalfAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  const quoteId = c.str("quoteId");
  if (!quoteId) throw new DomainError("Choose the option the customer approved.", "invalid", { quoteId: "Choose an option" });
  approveProposal(c.db, c.actor, c.str("proposalId"), quoteId, { onBehalfOfCustomer: true, note: c.str("note") });
  return "Approval recorded. This is not a purchase — move the project to Procurement separately.";
  });
}

export async function uploadDocumentAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", async (c) => {
  const file = c.file("file");
  if (!file) throw new DomainError("Choose a file to upload.", "invalid", { file: "Choose a file" });
  saveDocument(c.db, c.actor, { name: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) }, {
    projectId: c.str("projectId"), docType: c.str("docType"), customerVisible: c.form.get("customerVisible") === "on",
  });
  return "Document uploaded.";
  });
}

export async function setDocumentAccessAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  setDocumentAccess(c.db, c.actor, c.str("documentId"), c.str("access") === "customer_visible" ? "customer_visible" : "staff_only");
  return "Visibility updated.";
  });
}

export async function addAssetAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  addAsset(c.db, c.actor, c.str("projectId"), {
    category: c.str("category"), manufacturer: c.str("manufacturer"), model: c.str("model"), serialNumber: c.str("serialNumber"),
    installationDate: c.str("installationDate"), installerSupplierId: c.str("installerSupplierId"),
    commissioningState: c.str("commissioningState") || "not_commissioned", notes: c.str("notes"),
  });
  return "Installed equipment recorded.";
  });
}

export async function addWarrantyAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  addWarranty(c.db, c.actor, c.str("assetId"), {
    provider: c.str("provider"), terms: c.str("terms"), startDate: c.str("startDate"), endDate: c.str("endDate"), documentId: c.str("documentId"),
  });
  return "Warranty record added.";
  });
}

export async function createTicketAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  createServiceTicket(c.db, c.actor, c.str("projectId"), { description: c.str("description"), priority: c.str("priority") || "normal", assetId: c.str("assetId") });
  return "Service ticket created.";
  });
}

export async function updateTicketAction(_p: FormState, f: FormData): Promise<FormState> {
  return runAction(f, "staff", (c) => {
  updateServiceTicket(c.db, c.actor, c.str("ticketId"), {
    status: c.str("status") as never, priority: c.str("priority") as never, assignedTo: c.str("assignedTo") || null,
  });
  return "Ticket updated.";
  });
}
