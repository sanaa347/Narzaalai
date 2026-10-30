"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

export interface NavItem { href: string; label: string }

export function OpsNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/ops" ? path === "/ops" : path === href || path.startsWith(href + "/"));
  return (
    <nav aria-label="Control Center" className="flex gap-1 overflow-x-auto px-2 py-2 lg:flex-col lg:overflow-visible lg:px-3">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={active(i.href) ? "page" : undefined}
          className={cx(
            "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors",
            active(i.href) ? "bg-sun-400 text-navy-950" : "text-navy-200 hover:bg-navy-800 hover:text-white",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
