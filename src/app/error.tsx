"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui/primitives";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Logged for diagnosis; the user only sees a generic message (no stack traces or SQL).
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-navy-900">Алдаа гарлаа</h1>
      <p className="text-muted">
        Уучлаарай, системд санамсаргүй алдаа гарлаа. Дахин оролдоно уу. Асуудал давтагдвал манай багт мэдэгдэнэ үү.
        {error.digest && <span className="mt-2 block text-xs">Лавлах код: {error.digest}</span>}
      </p>
      <button type="button" onClick={reset} className={buttonClass("primary")}>Дахин оролдох</button>
    </main>
  );
}
