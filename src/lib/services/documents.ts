import fs from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db";
import { newId } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { canApproveAsCustomer, canViewDocument, isStaff } from "@/lib/auth/permissions";
import { DomainError } from "@/lib/domain/errors";
import type { DocumentRow, ProjectRow, QuoteRow } from "@/lib/db/types";
import { addEvent } from "./workflow";

export const DOC_TYPES = [
  "site_photo", "utility_bill", "quotation", "proposal", "contract", "delivery_note",
  "installation_evidence", "commissioning_report", "handover", "warranty", "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const CUSTOMER_UPLOAD_TYPES: readonly DocType[] = ["site_photo", "utility_bill", "other"];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Upper bound on files a customer can add to one project, so an account cannot fill the disk. Staff are not limited. */
export const MAX_CUSTOMER_DOCS_PER_PROJECT = 40;

const ALLOWED: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".txt": ["text/plain"],
  ".csv": ["text/csv", "application/vnd.ms-excel", "text/plain"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

function sniffOk(ext: string, b: Buffer): boolean {
  const starts = (sig: number[]) => sig.every((x, i) => b[i] === x);
  switch (ext) {
    case ".pdf": return starts([0x25, 0x50, 0x44, 0x46]);
    case ".png": return starts([0x89, 0x50, 0x4e, 0x47]);
    case ".jpg": case ".jpeg": return starts([0xff, 0xd8, 0xff]);
    case ".webp": return b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
    case ".docx": case ".xlsx": return starts([0x50, 0x4b]);
    default: return true;
  }
}

export const uploadDir = (): string => path.resolve(/*turbopackIgnore: true*/ process.env.NARZAALAI_UPLOAD_DIR ?? "data/uploads");

export interface UploadInput {
  name: string;
  mimeType: string;
  bytes: Buffer;
}

export interface SaveDocumentOptions {
  projectId?: string | null;
  quoteId?: string | null;
  docType: string;
  customerVisible?: boolean;
}

const safeName = (n: string) => path.basename(n).replace(/[^\p{L}\p{N}._ ()-]/gu, "_").slice(0, 150) || "file";

export function saveDocument(db: Db, actor: SessionUser | null, file: UploadInput, opts: SaveDocumentOptions): DocumentRow {
  if (!actor) throw new DomainError("Нэвтэрнэ үү.", "forbidden");
  if (!(DOC_TYPES as readonly string[]).includes(opts.docType)) throw new DomainError("Баримтын төрөл буруу байна.");
  if (file.bytes.length === 0) throw new DomainError("Хоосон файл байна.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new DomainError("Файл 10 МБ-аас хэтэрсэн байна.");
  const name = safeName(file.name);
  const ext = path.extname(name).toLowerCase();
  const okMimes = ALLOWED[ext];
  if (!okMimes) throw new DomainError("Энэ төрлийн файл (өргөтгөл) зөвшөөрөгдөөгүй. PDF, зураг (PNG/JPG/WEBP), DOCX, XLSX, CSV, TXT оруулна уу.");
  if (!sniffOk(ext, file.bytes)) throw new DomainError("Файлын агуулга өргөтгөлтэйгөө таарахгүй байна.");
  const mime = okMimes.includes(file.mimeType) ? file.mimeType : okMimes[0];

  let project: ProjectRow | undefined;
  let supplierId: string | null = null;
  let quote: QuoteRow | undefined;
  if (opts.quoteId) {
    if (!isStaff(actor)) throw new DomainError("Энэ үйлдлийг хийх эрх байхгүй.", "forbidden");
    quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(opts.quoteId) as QuoteRow | undefined;
    if (!quote) throw new DomainError("Quotation not found.", "not_found");
    supplierId = quote.supplier_id;
    if (quote.project_id) project = db.prepare("SELECT * FROM projects WHERE id = ?").get(quote.project_id) as ProjectRow | undefined;
  } else if (opts.projectId) {
    project = db.prepare("SELECT * FROM projects WHERE id = ?").get(opts.projectId) as ProjectRow | undefined;
    if (!project) throw new DomainError("Төсөл олдсонгүй.", "not_found");
  } else {
    throw new DomainError("Баримт аль төсөлд хамаарахыг заана уу.");
  }

  let access: "staff_only" | "customer_visible" = opts.customerVisible ? "customer_visible" : "staff_only";
  if (!isStaff(actor)) {
    if (!project || !canApproveAsCustomer(actor, project.org_id)) throw new DomainError("Төсөл олдсонгүй.", "not_found");
    if (!(CUSTOMER_UPLOAD_TYPES as readonly string[]).includes(opts.docType)) throw new DomainError("Энэ төрлийн баримтыг оруулах эрх байхгүй.", "forbidden");
    const used = db.prepare("SELECT COUNT(*) AS n FROM documents WHERE project_id = ? AND uploaded_by = ?").get(project.id, actor.id) as { n: number };
    if (used.n >= MAX_CUSTOMER_DOCS_PER_PROJECT) throw new DomainError("Нэг төсөлд оруулах файлын дээд хязгаарт хүрлээ. Манай багтай холбогдоно уу.", "conflict");
    access = "customer_visible"; // customers can always see what they uploaded
  }
  if (quote) access = "staff_only"; // supplier quotation documents are internal

  const id = newId();
  const storageName = `${id}${ext}`;
  const dir = uploadDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, storageName), file.bytes, { mode: 0o600 });
  db.transaction(() => {
    db.prepare(
      `INSERT INTO documents (id, project_id, supplier_id, quote_id, doc_type, original_name, storage_path, mime_type, size_bytes, uploaded_by, access)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, project?.id ?? null, supplierId, quote?.id ?? null, opts.docType, name, storageName, mime, file.bytes.length, actor.id, access);
    if (quote) db.prepare("UPDATE quotes SET document_id = ?, updated_at = ? WHERE id = ?").run(id, new Date().toISOString(), quote.id);
    if (project) {
      addEvent(db, {
        projectId: project.id, type: "DOCUMENT", actor, documentId: id, note: `${opts.docType}: ${name}`,
        customerVisible: access === "customer_visible", noteCustomerVisible: access === "customer_visible",
      });
    }
  })();
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow;
}

/** Returns file location only when the actor may view the document. Unauthorized and missing look identical. */
export function getDocumentForDownload(db: Db, actor: SessionUser | null, id: string): { doc: DocumentRow; absPath: string } | null {
  if (!actor) return null;
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
  if (!doc) return null;
  const orgId = doc.project_id ? ((db.prepare("SELECT org_id FROM projects WHERE id = ?").get(doc.project_id) as { org_id: string } | undefined)?.org_id ?? null) : null;
  if (!canViewDocument(actor, { orgId, supplierId: doc.supplier_id, access: doc.access })) return null;
  const absPath = path.join(uploadDir(), path.basename(doc.storage_path));
  if (!fs.existsSync(absPath)) return null;
  return { doc, absPath };
}

export function setDocumentAccess(db: Db, actor: SessionUser | null, id: string, access: "staff_only" | "customer_visible"): void {
  if (!isStaff(actor)) throw new DomainError("You do not have permission to perform this action.", "forbidden");
  const doc = db.prepare("SELECT quote_id FROM documents WHERE id = ?").get(id) as { quote_id: string | null } | undefined;
  if (!doc) throw new DomainError("Document not found.", "not_found");
  if (doc.quote_id && access === "customer_visible") throw new DomainError("Supplier quotation documents stay internal. Share the proposal instead.", "workflow");
  db.prepare("UPDATE documents SET access = ? WHERE id = ?").run(access, id);
}
