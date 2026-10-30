import type { ReactNode } from "react";
import { CustomerShell } from "@/components/shell/CustomerShell";
import { requireCustomer } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

/** Customer area gate: signed-in customers only. Staff are redirected to /ops, anonymous users to /login. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireCustomer();
  return <CustomerShell user={{ fullName: user.fullName }}>{children}</CustomerShell>;
}
