import { QuoteForm } from "@/components/ops/catalog/QuoteForm";
import { quoteFormOptions } from "@/components/ops/catalog/quoteData";
import Link from "next/link";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui/primitives";
import { createQuoteAction } from "@/lib/actions/ops-catalog";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";

export const metadata = { title: "Add quotation" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const actor = await requireStaff();
  const { projectId } = await searchParams;
  const { suppliers, projects } = quoteFormOptions(getDb(), actor);
  return (
    <>
      <PageHeader title="Add quotation" actions={<LinkButton href="/ops/quotes">Back to quotations</LinkButton>} />
      {suppliers.length === 0 ? (
        <Alert tone="warn" title="No active suppliers">Add a supplier first. <Link className="underline" href="/ops/suppliers/new">Add supplier</Link></Alert>
      ) : (
        <Card><QuoteForm action={createQuoteAction} suppliers={suppliers} projects={projects} defaultProjectId={projectId} submitLabel="Record quotation" /></Card>
      )}
    </>
  );
}
