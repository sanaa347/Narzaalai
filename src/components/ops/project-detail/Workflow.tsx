import { Card, CardTitle, DefList } from "@/components/ui/primitives";
import { ActionForm, CheckField, ConfirmSubmit, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/forms";
import { assignOwnerAction, changeStatusAction, recordMilestoneAction, updateScheduleAction } from "@/lib/actions/ops-projects";
import { allowedTargets, WORKFLOW_ONLY_TARGETS } from "@/lib/domain/status";
import { L, lab } from "@/i18n";
import type { ProjectBundle } from "@/lib/services/projects";

export function WorkflowPanel({ b, staff }: { b: ProjectBundle; staff: { id: string; full_name: string }[] }) {
  const p = b.project;
  const targets = allowedTargets(p.status, { resumeStatus: p.resume_status }).filter(
    // Approval is never offered here, except as the resume of a project that was delayed from APPROVED (the domain rule
    // `canTransition` permits exactly that case; otherwise such a project could only be cancelled).
    (t) => !WORKFLOW_ONLY_TARGETS.includes(t) || (p.status === "DELAYED" && p.resume_status === t),
  );
  const docOpts = b.documents.map((d) => ({ value: d.id, label: `${lab("en", "docType", d.doc_type)} — ${d.original_name}` }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card aria-labelledby="sec-status">
        <CardTitle id="sec-status">Update status</CardTitle>
        <p className="mb-3 text-sm text-muted">
          Current: <strong>{lab("en", "status", p.status)}</strong>. Each change is recorded with your name. Approval is recorded only through the proposal workflow;
          approval is not a purchase, and installation is not commissioning.
        </p>
        {targets.length === 0 ? <p className="text-sm text-muted">No further transitions are available from this status.</p> : (
          <ActionForm action={changeStatusAction}>
            <input type="hidden" name="projectId" value={p.id} />
            <SelectField name="to" label="New status" required placeholder="Choose…" options={targets.map((t) => ({ value: t, label: L.en.status[t] }))} />
            <TextAreaField name="note" label="Note" rows={2} hint="Required for Delayed, Cancelled and Rejected." />
            <SelectField name="documentId" label="Evidence document (optional)" placeholder="None" options={docOpts} hint="Commissioning report or handover document is required for Completed." />
            <TextField name="nextActionDue" type="date" label="Next action due (optional)" />
            <CheckField name="noteVisible" label="Show the note to the customer" />
            <ConfirmSubmit variant="primary" title="Change project status?" message="This is written to the project history and shown on the customer timeline. It cannot be undone, only followed by another recorded change." confirmLabel="Change status" cancelLabel="Cancel">Change status</ConfirmSubmit>
          </ActionForm>
        )}
      </Card>

      <div className="space-y-6">
        <Card aria-labelledby="sec-owner">
          <CardTitle id="sec-owner">Owner</CardTitle>
          <ActionForm action={assignOwnerAction}>
            <input type="hidden" name="projectId" value={p.id} />
            <SelectField name="userId" label="Assigned to" defaultValue={p.assigned_to ?? ""} placeholder="Unassigned" options={staff.map((s) => ({ value: s.id, label: s.full_name }))} />
            <SubmitButton pendingLabel="Saving…">Save owner</SubmitButton>
          </ActionForm>
        </Card>
        <Card aria-labelledby="sec-schedule">
          <CardTitle id="sec-schedule">Schedule &amp; blockers</CardTitle>
          <p className="mb-3 text-xs text-muted">A planned date is an estimate, never a guarantee: it depends on site eligibility, assessment, equipment, delivery, installer availability, weather and commissioning.</p>
          <ActionForm action={updateScheduleAction}>
            <input type="hidden" name="projectId" value={p.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="scheduledInstallDate" type="date" label="Planned installation date" defaultValue={p.scheduled_install_date} />
              <TextField name="nextActionDue" type="date" label="Next action due" defaultValue={p.next_action_due} />
            </div>
            <TextAreaField name="scheduleNotes" label="Schedule notes" rows={2} defaultValue={p.schedule_notes} />
            <TextAreaField name="blockedReason" label="Blocked reason" rows={2} defaultValue={p.blocked_reason} hint="Leave empty when not blocked." />
            <SubmitButton pendingLabel="Saving…">Save schedule</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card aria-labelledby="sec-milestone" className="lg:col-span-2">
        <CardTitle id="sec-milestone">Record milestone / evidence</CardTitle>
        <ActionForm action={recordMilestoneAction}>
          <input type="hidden" name="projectId" value={p.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField name="title" label="Milestone" required hint="e.g. Equipment delivered to site" />
            <SelectField name="documentId" label="Evidence document (optional)" placeholder="None" options={docOpts} />
          </div>
          <TextAreaField name="note" label="Details" rows={2} />
          <CheckField name="customerVisible" label="Show on the customer timeline" />
          <SubmitButton pendingLabel="Recording…">Record milestone</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

export function ScheduleSummary({ b }: { b: ProjectBundle }) {
  const p = b.project;
  return <DefList cols={3} items={[
    { label: "Planned install (estimate)", value: p.scheduled_install_date },
    { label: "Next action due", value: p.next_action_due },
    { label: "Blocked reason", value: p.blocked_reason },
  ]} />;
}
