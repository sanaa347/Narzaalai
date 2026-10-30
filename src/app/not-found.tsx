import { LinkButton } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-navy-900">Хуудас олдсонгүй</h1>
      <p className="text-muted">Таны хайсан хуудас байхгүй эсвэл танд харах эрх байхгүй байна.</p>
      <LinkButton href="/" variant="primary">Нүүр хуудас руу</LinkButton>
    </main>
  );
}
