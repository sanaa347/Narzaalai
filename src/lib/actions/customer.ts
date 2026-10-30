"use server";

import { DomainError } from "@/lib/domain/errors";
import { answerInfoRequest } from "@/lib/services/workflow";
import { saveDocument } from "@/lib/services/documents";
import { approveProposal } from "@/lib/services/proposals";
import { runAction } from "./run";
import type { FormState } from "./state";

export async function answerInfoAction(_prev: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "customer", ({ db, actor, str }) => {
    answerInfoRequest(db, actor, str("infoRequestId"), str("response"));
    return "Хариултыг хүлээн авлаа. Баярлалаа.";
  });
}

export async function uploadDocumentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const file = form.get("file");
  const bytes = file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : null;
  const name = file instanceof File ? file.name : "";
  const mimeType = file instanceof File ? file.type : "";
  return runAction(form, "customer", ({ db, actor, str }) => {
    if (!bytes) throw new DomainError("Файл сонгоно уу.", "invalid", { file: "Файл сонгоно уу" });
    saveDocument(db, actor, { name, mimeType, bytes }, { projectId: str("projectId"), docType: str("docType") });
    return "Файл амжилттай хадгалагдлаа.";
  });
}

export async function approveProposalAction(_prev: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "customer", ({ db, actor, str, opt }) => {
    approveProposal(db, actor, str("proposalId"), str("quoteId"), { note: opt("note") ?? null });
    return "Таны сонголт батлагдлаа. Энэ нь худалдан авалт биш — дараагийн үе шатуудыг цагийн хэлхээнээс харна уу.";
  });
}
