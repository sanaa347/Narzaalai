import { SupplierForm } from "@/components/ops/catalog/SupplierForm";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui/primitives";
import { createSupplierAction } from "@/lib/actions/ops-catalog";
import { requireStaff } from "@/lib/auth/current";

export const metadata = { title: "Add supplier" };

export default async function NewSupplierPage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Add supplier" actions={<LinkButton href="/ops/suppliers">Back to suppliers</LinkButton>} />
      <Alert tone="info" className="mb-4">A supplier is shown as “Evidence recorded” only when you enter qualification or certification evidence. Nothing is marked verified automatically.</Alert>
      <Card><SupplierForm action={createSupplierAction} submitLabel="Create supplier" /></Card>
    </>
  );
}
