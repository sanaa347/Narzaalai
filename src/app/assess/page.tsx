import { PublicFooter, PublicHeader } from "@/components/shell/PublicHeader";
import { Wizard } from "@/components/assess/Wizard";
import { getCurrentUser } from "@/lib/auth/current";
import { isStaff } from "@/lib/auth/permissions";
import { Alert, LinkButton } from "@/components/ui/primitives";

export const metadata = { title: "Үнэлгээ эхлэх" };
export const dynamic = "force-dynamic";

export default async function AssessPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const user = await getCurrentUser();
  return (
    <>
      <PublicHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <h1 className="mb-2 text-2xl font-bold text-navy-900 sm:text-3xl">Нарны эрчим хүчний үнэлгээ</h1>
        <p className="mb-6 text-sm text-muted">
          Мэдэхгүй зүйлээ «мэдэхгүй» гэж үлдээж болно. Үр дүн нь урьдчилсан тооцоо бөгөөд үнийн санал биш.
        </p>
        {user && (isStaff(user) || user.role !== "customer") ? (
          <Alert tone="warn" title="Ажилтны бүртгэлээр хүсэлт илгээх боломжгүй">
            Хэрэглэгчийн хүсэлт илгээхийн тулд гарч, хэрэглэгчээр нэвтэрнэ үү.
            <div className="mt-3"><LinkButton href="/ops" variant="primary" size="sm">Удирдлагын төв рүү</LinkButton></div>
          </Alert>
        ) : (
          <Wizard initialType={type === "household" || type === "business" ? type : null} signedIn={!!user} />
        )}
      </main>
      <PublicFooter />
    </>
  );
}
