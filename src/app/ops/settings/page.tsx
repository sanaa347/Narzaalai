import path from "node:path";
import { Badge, Card, CardTitle, DefList, DemoBadge, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { ActionForm, ConfirmSubmit, SelectField, SubmitButton, TextField } from "@/components/ui/forms";
import { createStaffAction, setUserStatusAction } from "@/lib/actions/ops-catalog";
import { requireStaff } from "@/lib/auth/current";
import { isAdmin } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { CALC_VERSION } from "@/lib/solar/prelim";
import { listStaffUsers, opsOverview } from "@/lib/services/projects";
import { L } from "@/i18n";

export const metadata = { title: "Settings" };

const MATRIX: { cap: string; customer: string; staff: string; admin: string; supplier: string }[] = [
  { cap: "Submit an assessment", customer: "Yes", staff: "No", admin: "No", supplier: "No" },
  { cap: "See own organization's projects, published proposals, customer-visible documents", customer: "Own only", staff: "—", admin: "—", supplier: "No" },
  { cap: "Approve a published proposal", customer: "Own project only", staff: "On behalf, recorded", admin: "On behalf, recorded", supplier: "No" },
  { cap: "Operations Control Center", customer: "No", staff: "Yes", admin: "Yes", supplier: "No" },
  { cap: "See all customers, internal notes, staff-only documents", customer: "No", staff: "Yes", admin: "Yes", supplier: "No" },
  { cap: "Manage suppliers, products, quotations, proposals, status", customer: "No", staff: "Yes", admin: "Yes", supplier: "No" },
  { cap: "View quotations", customer: "No (only via published proposals)", staff: "All", admin: "All", supplier: "Own supplier's only (data model; no portal in MVP)" },
  { cap: "Create / disable staff accounts", customer: "No", staff: "No", admin: "Yes", supplier: "No" },
];

export default async function SettingsPage() {
  const user = await requireStaff();
  const db = getDb();
  const staff = listStaffUsers(db);
  const o = opsOverview(db);
  const admin = isAdmin(user);
  return (
    <>
      <PageHeader title="Settings" description="Account, roles and system status." />
      <div className="space-y-6">
        <Card aria-labelledby="s-me">
          <CardTitle id="s-me">Your account</CardTitle>
          <DefList cols={3} items={[{ label: "Name", value: user.fullName }, { label: "Role", value: L.en.role[user.role] }, { label: "Status", value: user.status }]} />
          <p className="mt-3 text-xs text-muted">Roles are read from the database on every request; they cannot be set from the browser.</p>
        </Card>

        <section aria-labelledby="s-matrix">
          <h2 id="s-matrix" className="mb-2 text-base font-semibold">Role permissions (as enforced in code)</h2>
          <TableWrap caption="Role permission matrix">
            <thead><tr><Th>Capability</Th><Th>Customer</Th><Th>Staff</Th><Th>Admin</Th><Th>Supplier</Th></tr></thead>
            <tbody>{MATRIX.map((m) => <tr key={m.cap}><Td className="font-medium">{m.cap}</Td><Td>{m.customer}</Td><Td>{m.staff}</Td><Td>{m.admin}</Td><Td>{m.supplier}</Td></tr>)}</tbody>
          </TableWrap>
        </section>

        <section aria-labelledby="s-staff">
          <h2 id="s-staff" className="mb-2 text-base font-semibold">Staff accounts</h2>
          <TableWrap caption="Staff accounts">
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th>{admin && <Th>Action</Th>}</tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <Td>{s.full_name}{s.is_demo === 1 && <> <DemoBadge lang="en" /></>}</Td>
                  <Td>{s.email}</Td>
                  <Td>{L.en.role[s.role as keyof typeof L.en.role]}</Td>
                  <Td><Badge tone={s.status === "active" ? "success" : "danger"}>{s.status}</Badge></Td>
                  {admin && (
                    <Td>
                      {s.id === user.id ? <span className="text-muted">You</span> : (
                        <ActionForm action={setUserStatusAction} className="space-y-0">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="status" value={s.status === "active" ? "disabled" : "active"} />
                          {s.status === "active"
                            ? <ConfirmSubmit size="sm" title={`Disable ${s.full_name}?`} message="They will be signed out immediately and unable to sign in until re-enabled." confirmLabel="Disable account">Disable</ConfirmSubmit>
                            : <SubmitButton variant="secondary" size="sm" pendingLabel="…">Enable</SubmitButton>}
                        </ActionForm>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </section>

        {admin ? (
          <Card aria-labelledby="s-new">
            <CardTitle id="s-new">Create staff account</CardTitle>
            <ActionForm action={createStaffAction}>
              <div className="grid gap-3 md:grid-cols-2">
                <TextField name="fullName" label="Full name" required />
                <TextField name="email" type="email" label="Email" required autoComplete="off" />
                <TextField name="password" type="password" label="Initial password" required autoComplete="new-password" hint="At least 12 characters. Share it securely." />
                <SelectField name="role" label="Role" required defaultValue="staff" options={[{ value: "staff", label: "Staff" }, { value: "admin", label: "Admin" }]} />
              </div>
              <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
            </ActionForm>
          </Card>
        ) : <p className="text-sm text-muted">Only administrators can create or disable staff accounts.</p>}

        <Card aria-labelledby="s-sys">
          <CardTitle id="s-sys">System status</CardTitle>
          <DefList cols={3} items={[
            { label: "Database file", value: path.basename(process.env.NARZAALAI_DB_PATH ?? "narzaalai.db") },
            { label: "Demo projects present", value: o.demoProjects > 0 ? `Yes (${o.demoProjects})` : "No" },
            { label: "Preliminary calculation version", value: CALC_VERSION },
            { label: "Live device integration", value: "None configured" },
          ]} />
          <p className="mt-3 text-xs text-muted">Secrets and environment values are never displayed here.</p>
        </Card>
      </div>
    </>
  );
}
