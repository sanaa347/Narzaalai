import { ActionForm, FileField, SelectField, SubmitButton } from "@/components/ui/forms";
import { Card, CardTitle } from "@/components/ui/primitives";
import { uploadDocumentAction } from "@/lib/actions/customer";
import { fmtBytes, fmtDate } from "@/lib/format";
import { mnLab, options } from "@/i18n";
import type { DocumentRow } from "@/lib/db/types";

export function UploadForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={uploadDocumentAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <SelectField name="docType" label="Баримтын төрөл" required defaultValue="site_photo" options={options("mn", "docType", ["site_photo", "utility_bill", "other"])} />
      <FileField name="file" label="Файл" required accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv,.txt" hint="PDF, зураг (PNG/JPG/WEBP), DOCX, XLSX, CSV, TXT · 10 МБ хүртэл" />
      <SubmitButton variant="primary" pendingLabel="Хадгалж байна…">Файл оруулах</SubmitButton>
    </ActionForm>
  );
}

export function DocumentsPanel({ projectId, documents, canUpload }: { projectId: string; documents: DocumentRow[]; canUpload: boolean }) {
  return (
    <Card aria-labelledby="docs-h">
      <CardTitle id="docs-h">Баримтууд</CardTitle>
      {documents.length === 0 ? (
        <p className="mb-4 text-sm text-muted">Одоогоор баримт алга. Байршлын зураг, цахилгааны нэхэмжлэх оруулбал үнэлгээ илүү нарийвчлалтай болно.</p>
      ) : (
        <ul className="mb-4 divide-y divide-navy-100 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <a href={`/api/documents/${d.id}`} className="break-all font-medium text-navy-900 underline" target="_blank" rel="noopener noreferrer">{d.original_name}</a>
                <p className="text-xs text-muted">{mnLab("docType", d.doc_type)} · {fmtBytes(d.size_bytes)} · {fmtDate(d.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="border-t border-navy-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-navy-900">Баримт нэмэх</h3>
          <UploadForm projectId={projectId} />
        </div>
      )}
    </Card>
  );
}
