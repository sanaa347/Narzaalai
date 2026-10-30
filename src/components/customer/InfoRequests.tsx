import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/forms";
import { Alert, Badge, Card, CardTitle } from "@/components/ui/primitives";
import { answerInfoAction } from "@/lib/actions/customer";
import { fmtDateTime } from "@/lib/format";
import type { InfoRequestRow } from "@/lib/db/types";

export function InfoRequests({ items }: { items: InfoRequestRow[] }) {
  const open = items.filter((i) => i.status === "open");
  const done = items.filter((i) => i.status !== "open");
  if (items.length === 0) return null;
  return (
    <Card aria-labelledby="info-h">
      <CardTitle id="info-h">Манай багаас асуусан асуулт</CardTitle>
      {open.length === 0 && <p className="mb-3 text-sm text-muted">Одоогоор хариулах асуулт байхгүй.</p>}
      <div className="space-y-4">
        {open.map((i) => (
          <div key={i.id} className="rounded-lg border border-sun-500/60 bg-sun-100/50 p-3">
            <div className="mb-1 flex items-center gap-2"><Badge tone="warn">Хариу хүлээж байна</Badge><span className="text-xs text-muted">{fmtDateTime(i.created_at)}</span></div>
            <p className="mb-3 whitespace-pre-line text-sm font-medium text-navy-950">{i.message}</p>
            <ActionForm action={answerInfoAction}>
              <input type="hidden" name="infoRequestId" value={i.id} />
              <TextAreaField name="response" label="Таны хариулт" required rows={3} />
              <SubmitButton variant="primary" pendingLabel="Илгээж байна…">Хариулах</SubmitButton>
            </ActionForm>
          </div>
        ))}
        {done.map((i) => (
          <div key={i.id} className="rounded-lg border border-navy-100 p-3 text-sm">
            <p className="font-medium text-navy-900">{i.message}</p>
            {i.response ? <p className="mt-1 whitespace-pre-line text-muted">Таны хариулт: {i.response}</p> : <Alert tone="info" className="mt-2">Энэ асуултыг хаасан.</Alert>}
          </div>
        ))}
      </div>
    </Card>
  );
}
