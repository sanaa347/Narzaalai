import type { ReactNode } from "react";
import { OpsNav, type NavItem } from "@/components/shell/OpsNav";
import { Brand, buttonClass } from "@/components/ui/primitives";
import { logoutAction } from "@/lib/actions/auth";
import { requireStaff } from "@/lib/auth/current";
import { L } from "@/i18n";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/ops", label: "Overview" },
  { href: "/ops/inbox", label: "Assessment inbox" },
  { href: "/ops/projects", label: "Projects" },
  { href: "/ops/customers", label: "Customers" },
  { href: "/ops/suppliers", label: "Suppliers" },
  { href: "/ops/products", label: "Products" },
  { href: "/ops/quotes", label: "Quotations" },
  { href: "/ops/compare", label: "Compare" },
  { href: "/ops/monitoring", label: "Monitoring" },
  { href: "/ops/settings", label: "Settings" },
];

/** Operations Control Center gate. Authorization is checked on the server for every request; customers are redirected away. */
export default async function OpsLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-navy-900 text-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-start">
          <Brand href="/ops" inverted />
          <p className="text-xs text-navy-300">Control Center</p>
        </div>
        <OpsNav items={NAV} />
        <div className="hidden px-4 py-4 text-xs text-navy-300 lg:block">
          <p className="font-semibold text-white">{user.fullName}</p>
          <p>{L.en.role[user.role]}</p>
          <form action={logoutAction} className="mt-3">
            <button type="submit" className={buttonClass("secondary", "sm", "w-full")}>Sign out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 border-b border-navy-100 bg-white px-4 py-2 text-sm lg:hidden">
          <span className="truncate font-medium">{user.fullName} · {L.en.role[user.role]}</span>
          <form action={logoutAction}>
            <button type="submit" className={buttonClass("secondary", "sm")}>Sign out</button>
          </form>
        </div>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
