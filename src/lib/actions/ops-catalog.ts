"use server";

import { createSupplier, setSupplierArchived, updateSupplier } from "@/lib/services/suppliers";
import { createProduct, setProductArchived } from "@/lib/services/products";
import { createQuote, setQuoteArchived, setQuoteStatus, updateQuote } from "@/lib/services/quotes";
import { saveDocument } from "@/lib/services/documents";
import { createStaffUser, setUserStatus } from "@/lib/services/users";
import { DomainError } from "@/lib/domain/errors";
import { runAction, type ActionCtx } from "./run";
import type { FormState } from "./state";

const pick = (c: ActionCtx, names: readonly string[]) => Object.fromEntries(names.map((n) => [n, c.str(n)]));

const SUPPLIER_FIELDS = [
  "companyName", "contactName", "phone", "email", "serviceArea", "offerings", "supportedBrands", "installerCapability",
  "qualificationEvidence", "warrantyTerms", "status", "internalNotes",
] as const;

export async function createSupplierAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    const id = createSupplier(c.db, c.actor, pick(c, SUPPLIER_FIELDS));
    return { message: "Supplier created.", redirectTo: `/ops/suppliers/${id}` };
  });
}

export async function updateSupplierAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    updateSupplier(c.db, c.actor, c.str("id"), pick(c, SUPPLIER_FIELDS));
    return "Supplier saved.";
  });
}

export async function archiveSupplierAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    const archive = c.str("archive") === "1";
    setSupplierArchived(c.db, c.actor, c.str("id"), archive);
    return archive ? "Supplier archived." : "Supplier restored.";
  });
}

const PRODUCT_FIELDS = ["supplierId", "category", "manufacturer", "model", "specs", "price", "currency", "compatibility", "verificationState", "source", "lastCheckedOn"] as const;

export async function createProductAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    createProduct(c.db, c.actor, pick(c, PRODUCT_FIELDS));
    return { message: "Product added.", redirectTo: "/ops/products" };
  });
}

export async function archiveProductAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    const archive = c.str("archive") === "1";
    setProductArchived(c.db, c.actor, c.str("id"), archive);
    return archive ? "Product archived." : "Product restored.";
  });
}

const QUOTE_FIELDS = [
  "supplierId", "projectId", "reference", "quoteDate", "receivedOn", "validUntil", "currency", "lines", "installation", "delivery", "taxes",
  "otherCharges", "exclusions", "stockStatus", "leadTimeDays", "installationAvailability", "deliveryAssumptions", "warrantyTerms", "pvKwp", "batteryKwh", "inverterKw",
  "sourceType", "sourceNote", "status",
] as const;

export async function createQuoteAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    const id = createQuote(c.db, c.actor, pick(c, QUOTE_FIELDS));
    return { message: "Quotation recorded.", redirectTo: `/ops/quotes/${id}` };
  });
}

export async function updateQuoteAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    const id = c.str("id");
    updateQuote(c.db, c.actor, id, pick(c, QUOTE_FIELDS));
    return { message: "Quotation updated.", redirectTo: `/ops/quotes/${id}` };
  });
}

export async function setQuoteStatusAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    const status = c.str("status");
    if (status !== "draft" && status !== "received" && status !== "withdrawn") throw new DomainError("Invalid status.");
    setQuoteStatus(c.db, c.actor, c.str("id"), status);
    return `Quotation marked as ${status}.`;
  });
}

export async function archiveQuoteAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", (c) => {
    const archive = c.str("archive") === "1";
    setQuoteArchived(c.db, c.actor, c.str("id"), archive);
    return archive ? "Quotation archived." : "Quotation restored.";
  });
}

export async function uploadQuoteDocumentAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "staff", async (c) => {
    const f = c.file("file");
    if (!f) throw new DomainError("Choose a file to upload.", "invalid", { file: "Choose a file" });
    const bytes = Buffer.from(await f.arrayBuffer());
    saveDocument(c.db, c.actor, { name: f.name, mimeType: f.type, bytes }, { quoteId: c.str("id"), docType: "quotation" });
    return "Document attached.";
  });
}

export async function createStaffAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "admin", (c) => {
    createStaffUser(c.db, c.actor, pick(c, ["fullName", "email", "password", "role"]));
    return "Staff account created.";
  });
}

export async function setUserStatusAction(_p: FormState, form: FormData): Promise<FormState> {
  return runAction(form, "admin", (c) => {
    const status = c.str("status");
    if (status !== "active" && status !== "disabled") throw new DomainError("Invalid status.");
    setUserStatus(c.db, c.actor, c.str("id"), status);
    return status === "disabled" ? "Account disabled." : "Account enabled.";
  });
}
