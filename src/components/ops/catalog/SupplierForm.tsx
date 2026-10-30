import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField, type FormAction } from "@/components/ui/forms";
import { L, options } from "@/i18n";
import type { SupplierRow } from "@/lib/db/types";

/** Create/edit form for a supplier. Field names match SUPPLIER_FIELDS in src/lib/actions/ops-catalog.ts. */
export function SupplierForm({ action, supplier, submitLabel }: { action: FormAction; supplier?: SupplierRow; submitLabel: string }) {
  return (
    <ActionForm action={action}>
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="companyName" label="Company name" required defaultValue={supplier?.company_name} />
        <TextField name="contactName" label="Contact person" defaultValue={supplier?.contact_name} />
        <TextField name="phone" label="Phone" type="tel" defaultValue={supplier?.phone} />
        <TextField name="email" label="Email" type="email" defaultValue={supplier?.email} />
        <TextField name="serviceArea" label="Service area" hint="Provinces / cities served" defaultValue={supplier?.service_area} />
        <TextField name="supportedBrands" label="Supported brands" defaultValue={supplier?.supported_brands} />
      </div>
      <TextAreaField name="offerings" label="Products and services" defaultValue={supplier?.offerings} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="installerCapability" label="Installer capability" defaultValue={supplier?.installer_capability ?? "none"}
          options={options("en", "installerCapability")}
          hint={`“${L.en.installerCapability.verified}” can only be chosen when qualification evidence is recorded below.`}
        />
        <SelectField name="status" label="Status" defaultValue={supplier?.status ?? "active"} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
      </div>
      <TextAreaField
        name="qualificationEvidence" label="Qualification / certification evidence"
        hint="What, issued by whom, reference number. Leave empty if none has been seen — the supplier then stays “Unverified”."
        defaultValue={supplier?.qualification_evidence}
      />
      <TextAreaField name="warrantyTerms" label="Warranty terms (as stated by the supplier)" defaultValue={supplier?.warranty_terms} />
      <TextAreaField name="internalNotes" label="Internal notes" hint="Staff only." defaultValue={supplier?.internal_notes} />
      <SubmitButton variant="primary" pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
