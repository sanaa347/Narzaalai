import { Alert, Badge, Card, CardTitle, DefList, EmptyState, TableWrap, Td, Th } from "@/components/ui/primitives";
import { ActionForm, CheckField, FileField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/forms";
import { addAssetAction, addWarrantyAction, createTicketAction, setDocumentAccessAction, updateTicketAction, uploadDocumentAction } from "@/lib/actions/ops-projects";
import { fmtBytes, fmtDate, fmtDateTime } from "@/lib/format";
import { L, lab, options } from "@/i18n";
import type { ProjectBundle } from "@/lib/services/projects";

export function DocumentsSection({ b }: { b: ProjectBundle }) {
  return (
    <Card aria-labelledby="sec-docs">
      <CardTitle id="sec-docs">Documents</CardTitle>
      {b.documents.length === 0 ? <p className="text-sm text-muted">No documents yet.</p> : (
        <TableWrap caption="Project documents">
          <thead><tr><Th>File</Th><Th>Type</Th><Th>Size</Th><Th>Uploaded</Th><Th>Customer access</Th></tr></thead>
          <tbody>
            {b.documents.map((d) => (
              <tr key={d.id}>
                <Td><a className="font-medium underline" href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer">{d.original_name}</a></Td>
                <Td>{lab("en", "docType", d.doc_type)}</Td>
                <Td>{fmtBytes(d.size_bytes)}</Td>
                <Td className="whitespace-nowrap">{fmtDateTime(d.created_at)}</Td>
                <Td>
                  <ActionForm action={setDocumentAccessAction} className="flex items-center gap-2 space-y-0">
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="access" value={d.access === "customer_visible" ? "staff_only" : "customer_visible"} />
                    <Badge tone={d.access === "customer_visible" ? "success" : "neutral"}>{d.access === "customer_visible" ? "Visible to customer" : "Staff only"}</Badge>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="…">{d.access === "customer_visible" ? "Hide" : "Share"}</SubmitButton>
                  </ActionForm>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <hr className="my-4 border-navy-100" />
      <ActionForm action={uploadDocumentAction}>
        <input type="hidden" name="projectId" value={b.project.id} />
        <h3 className="text-sm font-semibold">Upload a document</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField name="docType" label="Type" required placeholder="Choose…" options={options("en", "docType")} />
          <FileField name="file" label="File" required hint="Max 10 MB." />
        </div>
        <CheckField name="customerVisible" label="Visible to the customer" />
        <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
      </ActionForm>
    </Card>
  );
}

export function AssetsSection({ b, suppliers, staff }: { b: ProjectBundle; suppliers: { id: string; company_name: string }[]; staff: { id: string; full_name: string }[] }) {
  const docOpts = b.documents.map((d) => ({ value: d.id, label: `${lab("en", "docType", d.doc_type)} — ${d.original_name}` }));
  const installed = ["INSTALLATION", "COMMISSIONING", "COMPLETED", "IN_SERVICE", "MAINTENANCE"].includes(b.project.status);
  return (
    <div className="space-y-6">
      <Card aria-labelledby="sec-assets">
        <CardTitle id="sec-assets">Installed equipment &amp; warranties</CardTitle>
        {b.assets.length === 0 ? <EmptyState title="No installed equipment recorded">Equipment can be recorded once the project reaches Installation. Serial numbers come from real nameplates or documents only.</EmptyState> : (
          <div className="space-y-4">
            {b.assets.map((a) => (
              <div key={a.id} className="rounded-lg border border-navy-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{lab("en", "productCategory", a.category)}: {a.manufacturer} {a.model}</p>
                  <Badge tone={a.commissioning_state === "commissioned" ? "success" : a.commissioning_state === "failed" ? "danger" : "warn"}>{lab("en", "commissioning", a.commissioning_state)}</Badge>
                </div>
                <DefList cols={3} items={[
                  { label: "Serial number", value: a.serial_number },
                  { label: "Installed", value: a.installation_date },
                  { label: "Installer", value: suppliers.find((s) => s.id === a.installer_supplier_id)?.company_name },
                  { label: "Notes", value: a.notes },
                ]} />
                <h4 className="mt-3 text-sm font-semibold">Warranty records</h4>
                {a.warranties.length === 0 ? <p className="text-sm text-muted">None recorded — no warranty is assumed.</p> : (
                  <ul className="mt-1 space-y-2 text-sm">
                    {a.warranties.map((w) => (
                      <li key={w.id} className="rounded bg-navy-50 p-2">
                        <Badge tone={w.verification_state === "evidence_recorded" ? "success" : "warn"}>{lab("en", "warrantyVerification", w.verification_state)}</Badge>{" "}
                        <strong>{w.provider}</strong> · {fmtDate(w.start_date)} → {fmtDate(w.end_date)}
                        {w.terms && <p className="whitespace-pre-wrap text-muted">{w.terms}</p>}
                        {w.document_id && <a className="underline" href={`/api/documents/${w.document_id}`} target="_blank" rel="noopener noreferrer">Evidence document</a>}
                      </li>
                    ))}
                  </ul>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">Add warranty record</summary>
                  <ActionForm action={addWarrantyAction} className="mt-2">
                    <input type="hidden" name="assetId" value={a.id} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <TextField name="provider" label="Warranty provider" required />
                      <SelectField name="documentId" label="Evidence document" placeholder="None (stays unverified)" options={docOpts} hint="Upload the warranty document first; without it the record is unverified." />
                      <TextField name="startDate" type="date" label="Start date" />
                      <TextField name="endDate" type="date" label="End date" />
                    </div>
                    <TextAreaField name="terms" label="Terms (as written in the document)" rows={2} />
                    <SubmitButton pendingLabel="Saving…">Add warranty</SubmitButton>
                  </ActionForm>
                </details>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card aria-labelledby="sec-addasset">
        <CardTitle id="sec-addasset">Record installed equipment</CardTitle>
        {!installed && <Alert tone="info" className="mb-3">Available once the project reaches Installation. Marking equipment “Commissioned” needs a commissioning report or handover document on the project.</Alert>}
        <ActionForm action={addAssetAction}>
          <input type="hidden" name="projectId" value={b.project.id} />
          <div className="grid gap-3 md:grid-cols-3">
            <SelectField name="category" label="Category" required placeholder="Choose…" options={options("en", "productCategory")} />
            <TextField name="manufacturer" label="Manufacturer" required />
            <TextField name="model" label="Model" required />
            <TextField name="serialNumber" label="Serial number" hint="Only from the nameplate or a document. Leave empty if unknown." />
            <TextField name="installationDate" type="date" label="Installation date" />
            <SelectField name="installerSupplierId" label="Installer" placeholder="Not recorded" options={suppliers.map((s) => ({ value: s.id, label: s.company_name }))} />
            <SelectField name="commissioningState" label="Commissioning state" defaultValue="not_commissioned" options={Object.entries(L.en.commissioning).map(([value, label]) => ({ value, label }))} />
          </div>
          <TextAreaField name="notes" label="Notes" rows={2} />
          <SubmitButton pendingLabel="Saving…">Record equipment</SubmitButton>
        </ActionForm>
      </Card>
      <Card aria-labelledby="sec-tickets">
        <CardTitle id="sec-tickets">Service tickets</CardTitle>
        {b.tickets.length === 0 ? <p className="mb-3 text-sm text-muted">No service tickets.</p> : (
          <TableWrap caption="Service tickets">
            <thead><tr><Th>Opened</Th><Th>Issue</Th><Th>Equipment</Th><Th>Update</Th></tr></thead>
            <tbody>
              {b.tickets.map((t) => (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap">{fmtDate(t.created_at)}</Td>
                  <Td className="max-w-xs whitespace-pre-wrap">{t.description}</Td>
                  <Td>{(() => { const a = b.assets.find((x) => x.id === t.asset_id); return a ? `${a.manufacturer} ${a.model}` : "—"; })()}</Td>
                  <Td>
                    <ActionForm action={updateTicketAction} className="grid min-w-[16rem] gap-2 space-y-0">
                      <input type="hidden" name="ticketId" value={t.id} />
                      <SelectField name="status" label="Status" defaultValue={t.status} options={Object.entries(L.en.ticketStatus).map(([value, label]) => ({ value, label }))} />
                      <SelectField name="priority" label="Priority" defaultValue={t.priority} options={Object.entries(L.en.ticketPriority).map(([value, label]) => ({ value, label }))} />
                      <SelectField name="assignedTo" label="Owner" defaultValue={t.assigned_to ?? ""} placeholder="Unassigned" options={staff.map((s) => ({ value: s.id, label: s.full_name }))} />
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">Update</SubmitButton>
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <ActionForm action={createTicketAction} className="mt-4">
          <input type="hidden" name="projectId" value={b.project.id} />
          <h3 className="text-sm font-semibold">Open a ticket</h3>
          <TextAreaField name="description" label="Issue" required rows={2} />
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField name="priority" label="Priority" defaultValue="normal" options={Object.entries(L.en.ticketPriority).map(([value, label]) => ({ value, label }))} />
            <SelectField name="assetId" label="Related equipment" placeholder="None" options={b.assets.map((a) => ({ value: a.id, label: `${a.manufacturer} ${a.model}` }))} />
          </div>
          <SubmitButton pendingLabel="Creating…">Create ticket</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

export function TimelineSection({ b }: { b: ProjectBundle }) {
  const events = [...b.events].reverse();
  return (
    <Card aria-labelledby="sec-timeline">
      <CardTitle id="sec-timeline">Project timeline (newest first)</CardTitle>
      <ol className="space-y-3">
        {events.map((e) => (
          <li key={e.id} className="border-l-2 border-navy-200 pl-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="neutral">{lab("en", "eventType", e.event_type)}</Badge>
              {e.new_status && <span className="font-medium">{e.previous_status ? `${lab("en", "status", e.previous_status)} → ` : ""}{lab("en", "status", e.new_status)}</span>}
              <Badge tone={e.customer_visible ? "success" : "neutral"}>{e.customer_visible ? "Shown to customer" : "Internal"}</Badge>
            </div>
            {e.note && <p className="mt-1 whitespace-pre-wrap text-sm">{e.note}{e.customer_visible && !e.note_customer_visible && <span className="text-xs text-muted"> (note internal)</span>}</p>}
            <p className="text-xs text-muted">{e.actor_label} · {fmtDateTime(e.created_at)}{e.document_id && <> · <a className="underline" href={`/api/documents/${e.document_id}`} target="_blank" rel="noopener noreferrer">evidence</a></>}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
