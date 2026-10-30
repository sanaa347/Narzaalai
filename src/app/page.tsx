import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/shell/PublicHeader";
import { Card, LinkButton } from "@/components/ui/primitives";

const JOURNEY = [
  { t: "Эрчим хүчний үнэлгээ", d: "Байршил, цахилгааны хэрэглээ, зорилгоо оруулна. Мэдэхгүй зүйлээ «мэдэхгүй» гэж тэмдэглэж болно." },
  { t: "Урьдчилсан төлөвлөгөө", d: "Системийн ойролцоо хүчин чадлын хүрээ, таамаглал, дутуу мэдээллийг ил харуулна. Энэ нь үнийн санал биш." },
  { t: "Нийлүүлэгчийн санал", d: "Манай баг нийлүүлэгчдээс огноотой, хүчинтэй хугацаатай албан ёсны санал авна." },
  { t: "Харьцуулалт ба батлалт", d: "Үнэ дангаар биш — хүчин чадал, тоног төхөөрөмж, баталгаа, хугацаа, хамаарахгүй зүйлийг хамт харьцуулна." },
  { t: "Худалдан авалт, суурилуулалт", d: "Батлалтын дараа худалдан авалт, суурилуулалтын хуваарийг тусад нь бүртгэж, явцыг цагийн хэлхээнд харуулна." },
  { t: "Туршилт, хүлээлгэн өгөх", d: "Ашиглалтад оруулсан акт бүртгэгдсэний дараа л төсөл «хүлээлгэн өгсөн» болно." },
  { t: "Баталгаа, үйлчилгээ", d: "Суурилуулсан тоног төхөөрөмж, баталгаа, засвар үйлчилгээний бүртгэл нэг дор хадгалагдана." },
];

const TRUST = [
  { t: "Урьдчилсан тооцоо ≠ үнийн санал", d: "Анхны тооцоо нь таны оруулсан мэдээлэлд суурилсан ойролцоо хүрээ. Бид зардал, хэмнэлт, нөхөн төлөгдөх хугацааг баталгаатай өгөгдөлгүйгээр зохиож хэлэхгүй." },
  { t: "Үнийн санал нь нийлүүлэгчээс ирсэн, огноотой байна", d: "Хугацаа дууссан эсвэл баталгаагүй үнийг хүчинтэй санал мэтээр харуулдаггүй. Жишээ (демо) үнийг тусад нь тэмдэглэнэ." },
  { t: "Батлалт ≠ худалдан авалт", d: "Саналыг батлах нь тоног төхөөрөмж захиалсан гэсэн үг биш. Худалдан авалт, суурилуулалт, туршилт бүр тусдаа үе шат." },
  { t: "Суурилуулалтын хуваарь амлалт биш", d: "Нийлүүлэлт, суурилуулагчийн боломж, цаг агаар, байршлын нөхцөл, холболтын шаардлагаас хамаарна." },
  { t: "Гэрчилгээ, баталгааг зохиохгүй", d: "Нийлүүлэгч, суурилуулагчийг «баталгаажсан» гэж харуулахдаа бүртгэсэн нотолгоо шаардана." },
  { t: "Таны мэдээлэл хувийн", d: "Та зөвхөн өөрийн бүртгэл, төслийг харна. Нийлүүлэгчид бусад хэрэглэгчийн мэдээллийг харахгүй." },
];

export default async function Home() {
  return (
    <>
      <PublicHeader inverted />
      <main id="main">
        <section className="bg-navy-900 text-white">
          <div className="mx-auto max-w-6xl px-4 pb-14 pt-10 sm:pb-20 sm:pt-16">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-sun-300">Монголын нарны эрчим хүчний платформ</p>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">Нарны төслөө нэг дороос, ил тод зохицуул</h1>
            <p className="mt-4 max-w-2xl text-base text-navy-200 sm:text-lg">
              Нарзаалай нь өрх, бизнесийг эрчим хүчний үнэлгээнээс эхлээд нийлүүлэгчийн саналын харьцуулалт, суурилуулалт, баталгаа хүртэл
              нэг төслийн бүртгэлээр дамжуулан холбодог.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/assess" variant="sun" size="lg">Үнэлгээ эхлэх</LinkButton>
              <LinkButton href="#journey" variant="ghost" size="lg" className="!text-white hover:!bg-navy-800 !border-navy-700">Хэрхэн ажилладаг вэ</LinkButton>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <Link href="/assess?type=household" className="group rounded-xl border border-navy-700 bg-navy-800 p-5 no-underline transition-colors hover:border-sun-400">
                <p className="text-lg font-semibold text-white">Өрх, айл</p>
                <p className="mt-1 text-sm text-navy-200">Гэр, хувийн сууц, хөдөөгийн өмч хөрөнгө. Цахилгааны зардал, нөөц цахилгааны хэрэгцээгээ тодорхойлно.</p>
                <p className="mt-3 text-sm font-semibold text-sun-300 group-hover:underline">Өрхийн үнэлгээ эхлэх →</p>
              </Link>
              <Link href="/assess?type=business" className="group rounded-xl border border-navy-700 bg-navy-800 p-5 no-underline transition-colors hover:border-sun-400">
                <p className="text-lg font-semibold text-white">Бизнес, байгууллага</p>
                <p className="mt-1 text-sm text-navy-200">Дэлгүүр, оффис, цех, агуулах, ферм. Ажиллах цаг, ачаалал, тасалдуулж болохгүй тоног төхөөрөмжөө тодорхойлно.</p>
                <p className="mt-3 text-sm font-semibold text-sun-300 group-hover:underline">Бизнесийн үнэлгээ эхлэх →</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="what">
          <h2 id="what" className="text-2xl font-bold text-navy-900">Нарзаалай гэж юу вэ?</h2>
          <p className="mt-3 max-w-3xl text-muted">
            Нарзаалай нь зөвхөн тооцоолуур эсвэл нийлүүлэгчдийн жагсаалт биш. Бид таны төслийн мэдээлэл, зохицуулалтыг нэг дор хадгалж,
            тоног төхөөрөмж нийлүүлэгчид болон мэргэшсэн суурилуулагч хамтрагчидтай холбож өгдөг. Бодит суурилуулалтыг суурилуулагч хамтрагч хийнэ.
          </p>
        </section>

        <section id="journey" className="mx-auto max-w-6xl scroll-mt-4 px-4 pb-4" aria-labelledby="journey-h">
          <h2 id="journey-h" className="text-2xl font-bold text-navy-900">Таны төслийн замнал</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {JOURNEY.map((s, i) => (
              <li key={s.t}>
                <Card className="h-full">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sun-400 text-sm font-bold text-navy-950" aria-hidden="true">{i + 1}</span>
                    <div>
                      <h3 className="font-semibold text-navy-900">{s.t}</h3>
                      <p className="mt-1 text-sm text-muted">{s.d}</p>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto mt-12 max-w-6xl px-4" aria-labelledby="trust">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy-100 sm:p-8">
            <h2 id="trust" className="text-2xl font-bold text-navy-900">Бид хэрхэн ил тод ажилладаг вэ</h2>
            <p className="mt-2 max-w-3xl text-muted">Тооцоо, санал, суурилуулалт бүр өөр өөр төлөвтэй. Бид тэдгээрийг хольж харуулдаггүй.</p>
            <dl className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2">
              {TRUST.map((x) => (
                <div key={x.t}>
                  <dt className="font-semibold text-navy-900">{x.t}</dt>
                  <dd className="mt-1 text-sm text-muted">{x.d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-6xl px-4" aria-labelledby="cta">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-sun-100 p-6">
            <div>
              <h2 id="cta" className="text-xl font-bold text-navy-900">Эхлэхэд 5–10 минут хангалттай</h2>
              <p className="mt-1 text-sm text-navy-800">Бүх мэдээллийг мэдэх шаардлагагүй. Дутуу хэсгийг манай баг хамт тодруулна.</p>
            </div>
            <LinkButton href="/assess" variant="primary" size="lg">Үнэлгээ эхлэх</LinkButton>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
