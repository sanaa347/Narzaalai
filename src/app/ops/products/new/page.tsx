import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/forms";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui/primitives";
import { createProductAction } from "@/lib/actions/ops-catalog";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { CURRENCIES } from "@/lib/domain/money";
import { options } from "@/i18n";
import { listSuppliers } from "@/lib/services/suppliers";

export const metadata = { title: "Add product" };

export default async function NewProductPage() {
  const actor = await requireStaff();
  const suppliers = listSuppliers(getDb(), actor);
  return (
    <>
      <PageHeader title="Add product" actions={<LinkButton href="/ops/products">Back to products</LinkButton>} />
      <Alert tone="info" className="mb-4">A price is optional. If you enter one, record its source and the date it was checked — it is shown as an indicative price, never as a quotation.</Alert>
      <Card>
        <ActionForm action={createProductAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="category" label="Category" required placeholder="Choose…" options={options("en", "productCategory")} />
            <SelectField name="supplierId" label="Supplier (optional)" placeholder="— none —" options={suppliers.map((s) => ({ value: s.id, label: s.company_name + (s.is_demo ? " (DEMO)" : "") }))} />
            <TextField name="manufacturer" label="Manufacturer" required />
            <TextField name="model" label="Model" required />
          </div>
          <TextAreaField name="specs" label="Specifications" />
          <TextAreaField name="compatibility" label="Compatibility notes" />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="price" label="Indicative unit price" inputMode="decimal" hint="Leave empty if unknown." />
            <SelectField name="currency" label="Currency" defaultValue="MNT" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <TextField name="lastCheckedOn" label="Price checked on" type="date" />
          </div>
          <TextField name="source" label="Price / data source" hint="e.g. supplier price list PDF, call on 2026-10-01" />
          <SelectField name="verificationState" label="Verification" defaultValue="unverified" options={options("en", "productVerification")} />
          <SubmitButton variant="primary" pendingLabel="Saving…">Add product</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
