import { Brand, LinkButton } from "@/components/ui/primitives";
import { getCurrentUser } from "@/lib/auth/current";
import { isStaff } from "@/lib/auth/permissions";

export async function PublicHeader({ inverted = false }: { inverted?: boolean }) {
  const user = await getCurrentUser();
  return (
    <header className={inverted ? "bg-navy-900" : "border-b border-navy-100 bg-white"}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Brand inverted={inverted} />
        <nav aria-label="Үндсэн цэс" className="flex items-center gap-2">
          {user ? (
            <LinkButton href={isStaff(user) ? "/ops" : "/dashboard"} variant={inverted ? "sun" : "primary"} size="sm">
              {isStaff(user) ? "Удирдлагын төв" : "Миний самбар"}
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant={inverted ? "ghost" : "secondary"} size="sm" className={inverted ? "!text-white hover:!bg-navy-800" : undefined}>
                Нэвтрэх
              </LinkButton>
              <LinkButton href="/assess" variant="sun" size="sm">Үнэлгээ эхлэх</LinkButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-navy-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted">
        <p className="font-semibold text-navy-900">Нарзаалай · Монголын нарны эрчим хүчний экосистем</p>
        <p className="mt-1 max-w-3xl">
          Энэ нь платформын эхний (MVP) хувилбар. Урьдчилсан тооцоо нь үнийн санал биш бөгөөд бодит санал, суурилуулалтыг гэрээт нийлүүлэгч,
          суурилуулагч хамтрагчид хийнэ.
        </p>
      </div>
    </footer>
  );
}
