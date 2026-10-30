import { describe, expect, it } from "vitest";
import { MAIN_PATH, PROJECT_STATUSES, allowedTargets, canTransition, type ProjectStatus } from "@/lib/domain/status";

const ok = (from: ProjectStatus, to: ProjectStatus, ctx = {}) => canTransition(from, to, ctx).ok;

describe("project status machine", () => {
  it("allows the happy path one step at a time", () => {
    const ctx = { hasPublishedProposal: true, hasCommissioningEvidence: true, viaApprovalWorkflow: true };
    for (let i = 0; i < MAIN_PATH.length - 1; i++) {
      const from = MAIN_PATH[i], to = MAIN_PATH[i + 1];
      expect(ok(from, to, ctx), `${from} → ${to}`).toBe(true);
    }
  });
  it("does not allow skipping steps", () => {
    expect(ok("SUBMITTED", "APPROVED", { viaApprovalWorkflow: true })).toBe(false);
    expect(ok("QUOTE_REQUESTED", "APPROVED", { viaApprovalWorkflow: true })).toBe(false);
    expect(ok("APPROVED", "INSTALLATION")).toBe(false);
    expect(ok("INSTALLATION", "COMPLETED", { hasCommissioningEvidence: true })).toBe(false);
  });
  it("approval is reachable only through the approval workflow", () => {
    expect(ok("PROPOSAL_READY", "APPROVED")).toBe(false);
    expect(ok("PROPOSAL_READY", "APPROVED", { viaApprovalWorkflow: true })).toBe(true);
  });
  it("requires a published proposal for PROPOSAL_READY and commissioning evidence for COMPLETED", () => {
    expect(ok("QUOTE_REQUESTED", "PROPOSAL_READY")).toBe(false);
    expect(ok("QUOTE_REQUESTED", "PROPOSAL_READY", { hasPublishedProposal: true })).toBe(true);
    expect(ok("COMMISSIONING", "COMPLETED")).toBe(false);
    expect(ok("COMMISSIONING", "COMPLETED", { hasCommissioningEvidence: true })).toBe(true);
  });
  it("installation does not imply commissioning and approval does not imply procurement", () => {
    expect(allowedTargets("INSTALLATION")).not.toContain("COMPLETED");
    expect(allowedTargets("APPROVED")).not.toContain("INSTALLATION");
  });
  it("cancel/reject/delay need a written reason", () => {
    expect(ok("ASSESSMENT", "CANCELLED")).toBe(false);
    expect(ok("ASSESSMENT", "CANCELLED", { note: "  " })).toBe(false);
    expect(ok("ASSESSMENT", "CANCELLED", { note: "Customer withdrew" })).toBe(true);
    expect(ok("QUOTE_REQUESTED", "DELAYED", { note: "Supplier stock" })).toBe(true);
  });
  it("a delayed project can only resume where it left off, or be cancelled", () => {
    expect(allowedTargets("DELAYED", { resumeStatus: "PROCUREMENT" })).toEqual(["PROCUREMENT", "CANCELLED"]);
    expect(ok("DELAYED", "INSTALLATION", { resumeStatus: "PROCUREMENT" })).toBe(false);
    expect(ok("DELAYED", "PROCUREMENT", { resumeStatus: "PROCUREMENT" })).toBe(true);
  });
  it("regression: a project delayed from APPROVED can resume to APPROVED, but nothing else can reach APPROVED without the workflow", () => {
    expect(ok("DELAYED", "APPROVED", { resumeStatus: "APPROVED" })).toBe(true);
    // The exemption is only for restoring the saved status — never a back door:
    expect(ok("PROPOSAL_READY", "APPROVED")).toBe(false);
    expect(ok("DELAYED", "APPROVED", { resumeStatus: "PROCUREMENT" })).toBe(false);
    expect(ok("PROPOSAL_READY", "APPROVED", { viaApprovalWorkflow: true })).toBe(true);
  });
  it("terminal states have no exits and no-op transitions are refused", () => {
    expect(allowedTargets("CANCELLED")).toEqual([]);
    expect(allowedTargets("REJECTED")).toEqual([]);
    expect(ok("ASSESSMENT", "ASSESSMENT")).toBe(false);
  });
  it("every status is defined in the transition table", () => {
    for (const s of PROJECT_STATUSES) expect(Array.isArray(allowedTargets(s, { resumeStatus: "ASSESSMENT" }))).toBe(true);
  });
});
