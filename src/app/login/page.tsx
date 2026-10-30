import { redirect } from "next/navigation";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/forms";
import { Card, LinkButton } from "@/components/ui/primitives";
import { loginAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/current";
import { portalFor } from "@/lib/auth/permissions";

export const metadata = { title: "Нэвтрэх" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const portal = portalFor(user);
  if (portal) redirect(portal === "ops" ? "/ops" : "/dashboard");
  const { next } = await searchParams;
  return (
    <>
      <PublicHeader />
      <main id="main" className="mx-auto max-w-md px-4 py-10">
        <h1 className="mb-2 text-2xl font-bold text-navy-900">Нэвтрэх</h1>
        <p className="mb-6 text-sm text-muted">Өөрийн төслийн явц, санал, баримтаа харахын тулд нэвтэрнэ үү.</p>
        <Card>
          <ActionForm action={loginAction}>
            <input type="hidden" name="next" value={next ?? ""} />
            <TextField name="email" type="email" label="Имэйл" required autoComplete="email" inputMode="email" />
            <TextField name="password" type="password" label="Нууц үг" required autoComplete="current-password" />
            <SubmitButton variant="primary" pendingLabel="Нэвтэрч байна…" className="w-full">Нэвтрэх</SubmitButton>
          </ActionForm>
        </Card>
        <p className="mt-6 text-center text-sm text-muted">
          Бүртгэлгүй юу? Үнэлгээний хүсэлт илгээх үед бүртгэл автоматаар үүснэ.
        </p>
        <div className="mt-3 flex justify-center">
          <LinkButton href="/assess" variant="sun">Үнэлгээ эхлэх</LinkButton>
        </div>
      </main>
    </>
  );
}
