import Link from "next/link";
import type { ReactNode } from "react";
import { Brand, buttonClass } from "@/components/ui/primitives";
import { logoutAction } from "@/lib/actions/auth";

export function CustomerShell({ user, children }: { user: { fullName: string }; children: ReactNode }) {
  return (
    <>
      <header className="border-b border-navy-100 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Brand href="/dashboard" />
          <nav aria-label="Хэрэглэгчийн цэс" className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/dashboard" className={buttonClass("ghost", "sm")}>Миний төслүүд</Link>
            <Link href="/assess" className={buttonClass("ghost", "sm")}>Шинэ үнэлгээ</Link>
            <span className="hidden text-muted sm:inline" aria-label="Нэвтэрсэн хэрэглэгч">{user.fullName}</span>
            <form action={logoutAction}>
              <button type="submit" className={buttonClass("secondary", "sm")}>Гарах</button>
            </form>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
