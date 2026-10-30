"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClass, Alert, Card, cx } from "@/components/ui/primitives";
import { submitAssessmentAction } from "@/lib/actions/auth";
import { L, options } from "@/i18n";
import { OBJECTIVES } from "@/lib/validation/assessment";
import {
  DRAFT_KEY, STEP_COUNT, STEP_TITLES, initialValues, missingHints, propertyOptions, splitServerErrors, str, summarize, toAccount, toPayload,
  validateWizardStep, type Values,
} from "./wizard-logic";

const CTRL = "block w-full rounded-lg border bg-white px-3 py-2 text-base min-h-11 sm:text-sm";

export function Wizard({ initialType, signedIn }: { initialType: "household" | "business" | null; signedIn: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => initialValues(initialType));
  const [password, setPassword] = useState("");
  const [step, setStep] = useState(initialType ? 1 : 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loaded = useRef(false);

  // Restore draft (never contains the password). A ?type= link overrides the stored customer type.
  useEffect(() => {
    // Deferred so the restore is an external-system callback, not a synchronous setState in the effect body.
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw) as { values?: Values; step?: number };
          if (d.values && typeof d.values === "object") {
            const merged = { ...initialValues(initialType), ...d.values };
            if (initialType) merged.customerType = initialType;
            setValues(merged);
            if (!initialType && typeof d.step === "number") setStep(Math.min(Math.max(d.step, 0), STEP_COUNT - 1));
            setRestored(true);
          }
        }
      } catch { /* storage unavailable: wizard still works */ }
      loaded.current = true;
    });
  }, [initialType]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      const { password: _p, ...safe } = values as Values & { password?: unknown };
      void _p;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ values: safe, step }));
    } catch { /* ignore */ }
  }, [values, step]);

  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const set = (k: string, v: unknown) => {
    setValues((p) => ({ ...p, [k]: v }));
    setErrors((p) => { if (!(k in p)) return p; const n = { ...p }; delete n[k]; return n; });
  };
  const type = str(values.customerType);

  function next() {
    const e = validateWizardStep(step, values, password, signedIn);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep(step + 1);
  }

  async function submit() {
    setFormError(null);
    for (let s = 0; s < STEP_COUNT; s++) {
      const e = validateWizardStep(s, values, password, signedIn);
      if (Object.keys(e).length) { setErrors(e); setStep(s); return; }
    }
    setBusy(true);
    try {
      const res = await submitAssessmentAction(toPayload(values), signedIn ? null : toAccount(values, password));
      if (res.ok && res.redirectTo) {
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        router.push(res.redirectTo);
        return;
      }
      const { step: s, errors: e } = splitServerErrors(res.fieldErrors);
      setErrors(e);
      setFormError(res.message ?? "Хүсэлтийг илгээж чадсангүй. Дахин оролдоно уу.");
      setStep(s);
    } catch {
      setFormError("Сүлжээний алдаа гарлаа. Таны оруулсан мэдээлэл хадгалагдсан хэвээр байна, дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setValues(initialValues(initialType)); setPassword(""); setErrors({}); setStep(initialType ? 1 : 0); setRestored(false);
  }

  const errList = Object.entries(errors);
  const hints = missingHints(values);

  // field helpers bound to state
  const F = (name: string, label: string, o: { type?: string; hint?: string; required?: boolean; mode?: "numeric" | "decimal" | "tel" | "email" | "text"; area?: boolean; ac?: string; placeholder?: string } = {}) => (
    <Field key={name} name={name} label={label} error={errors[name]} hint={o.hint} required={o.required}>
      {(id, aria) =>
        o.area ? (
          <textarea id={id} rows={3} value={str(values[name])} onChange={(e) => set(name, e.target.value)} className={cx(CTRL, errors[name] ? "border-danger-600" : "border-navy-200")} placeholder={o.placeholder} {...aria} />
        ) : (
          <input id={id} type={o.type ?? "text"} inputMode={o.mode} autoComplete={o.ac} value={str(values[name])} onChange={(e) => set(name, e.target.value)} className={cx(CTRL, errors[name] ? "border-danger-600" : "border-navy-200")} placeholder={o.placeholder} {...aria} />
        )
      }
    </Field>
  );
  const S = (name: string, label: string, opts: { value: string; label: string }[], o: { hint?: string; required?: boolean } = {}) => (
    <Field key={name} name={name} label={label} error={errors[name]} hint={o.hint} required={o.required}>
      {(id, aria) => (
        <select id={id} value={str(values[name])} onChange={(e) => set(name, e.target.value)} className={cx(CTRL, errors[name] ? "border-danger-600" : "border-navy-200")} {...aria}>
          <option value="">— Сонгоно уу —</option>
          {opts.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      )}
    </Field>
  );

  const stepBody: ReactNode = (() => {
    switch (step) {
      case 0:
        return (
          <fieldset>
            <legend className="sr-only">Хэрэглэгчийн төрөл</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["household", "business"] as const).map((t) => (
                <label key={t} className={cx("flex min-h-24 cursor-pointer flex-col gap-1 rounded-xl border-2 p-4 focus-within:ring-2 focus-within:ring-sun-500", type === t ? "border-navy-900 bg-navy-50" : "border-navy-200 bg-white")}>
                  <input type="radio" name="customerType" value={t} checked={type === t} onChange={() => { set("customerType", t); set("propertyType", ""); }} className="sr-only" />
                  <span className="text-lg font-semibold text-navy-900">{L.mn.customerType[t]}</span>
                  <span className="text-sm text-muted">{t === "household" ? "Гэр, хувийн байшин, хөдөөгийн өмч хөрөнгө" : "Дэлгүүр, оффис, цех, агуулах, ферм"}</span>
                </label>
              ))}
            </div>
            {errors.customerType && <p className="mt-2 text-sm font-medium text-danger-600">{errors.customerType}</p>}
          </fieldset>
        );
      case 1:
        return (
          <div className="space-y-4">
            {!signedIn && (
              <fieldset className="space-y-4 rounded-xl border border-navy-100 p-4">
                <legend className="px-1 text-sm font-semibold text-navy-900">Холбоо барих мэдээлэл</legend>
                {F("fullName", "Овог нэр", { required: true, ac: "name" })}
                {F("phone", "Утасны дугаар", { required: true, mode: "tel", ac: "tel" })}
                {F("email", "Имэйл", { required: true, type: "email", mode: "email", ac: "email", hint: "Нэвтрэхэд ашиглана." })}
              </fieldset>
            )}
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-semibold text-navy-900">Байршил, байр</legend>
              {F("province", "Аймаг / нийслэл", { required: true })}
              <div className="grid gap-4 sm:grid-cols-2">{F("district", "Сум / дүүрэг")}{F("city", "Хот / суурин")}</div>
              {F("locationDescription", "Байршлын тайлбар", { required: true, area: true, hint: "Жишээ нь: хотын захын гэр хороолол, сумын төвөөс 15 км." })}
              {S("propertyType", "Байрны төрөл", propertyOptions(type), { required: true })}
              {S("ownership", "Өмчлөл / эзэмшил", options("mn", "ownership"), { required: true })}
              {F("address", "Хаяг (заавал биш)")}
              <div className="grid gap-4 sm:grid-cols-2">
                {F("latitude", "Өргөрөг (заавал биш)", { mode: "decimal", hint: "Мэдэхгүй бол хоосон үлдээнэ үү." })}
                {F("longitude", "Уртраг (заавал биш)", { mode: "decimal" })}
              </div>
              {F("installAreaM2", "Суурилуулах боломжтой талбай (м²)", { mode: "decimal" })}
              {F("installAreaNote", "Дээвэр, хашаа, талбайн тайлбар", { area: true })}
              {F("shadingNotes", "Сүүдэр, бусад саад", { area: true, hint: "Мод, барилга, уул зэрэг сүүдэрлэх зүйл." })}
            </fieldset>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-semibold text-navy-900">Цахилгааны хэрэглээ</legend>
              {F("monthlyKwh", "Сарын хэрэглээ (кВт·ц)", { mode: "decimal", hint: "Цахилгааны нэхэмжлэхээс харна уу." })}
              <div className="grid gap-4 sm:grid-cols-2">
                {F("billAmount", "Сарын төлбөрийн дүн (₮)", { mode: "decimal" })}
                {F("billingPeriod", "Төлбөрийн хугацаа", { placeholder: "2026 оны 9-р сар" })}
              </div>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="checkbox" checked={values.usageUnknown === true} onChange={(e) => set("usageUnknown", e.target.checked)} className="mt-1 h-5 w-5 accent-navy-900" />
                <span>Хэрэглээгээ мэдэхгүй байна<span className="block text-xs text-muted">Тооцоо хийхэд мэдээлэл дутах тул бид дараа нь лавлана.</span></span>
              </label>
              {errors.usageUnknown && <p className="text-sm font-medium text-danger-600">{errors.usageUnknown}</p>}
              {F("utilityBillNote", "Нэхэмжлэхийн нэмэлт мэдээлэл", { area: true })}
              {F("majorLoads", "Үндсэн цахилгаан хэрэгсэл, машин механизм", { area: true })}
              {F("operatingHours", "Ойролцоо ажиллах цаг", { area: true })}
              {S("backupNeeded", "Нөөц цахилгаан хэрэгтэй юу?", options("mn", "backup"), { required: true })}
              {F("criticalLoads", "Тасалдуулж болохгүй ачаалал", { area: true, hint: "Цахилгаан тасрахад заавал ажиллах ёстой зүйл." })}
              {F("existingEquipment", "Одоо байгаа нарны панель, батарей, инвертер", { area: true })}
            </fieldset>
            {type === "business" && (
              <fieldset className="space-y-4 rounded-xl border border-navy-100 p-4">
                <legend className="px-1 text-sm font-semibold text-navy-900">Бизнесийн мэдээлэл</legend>
                {F("businessName", "Байгууллагын нэр", { required: true })}
                {F("businessCategory", "Үйл ажиллагааны төрөл", { required: true })}
                {F("businessOperatingHours", "Ажиллах цаг", { required: true })}
                {F("businessUsagePattern", "Өдрийн хэрэглээний хэв маяг", { required: true, area: true })}
                {F("businessSeasonalPattern", "Улирлын хэлбэлзэл", { area: true })}
                {F("businessCriticalEquipment", "Чухал тоног төхөөрөмж", { area: true })}
                {F("additionalSitesNote", "Бусад байршил (олон байршилтай бол)", { area: true })}
              </fieldset>
            )}
            {hints.length > 0 && (
              <Alert tone="info" title="Эдгээр мэдээллийг өгвөл тооцоо илүү нарийвчлалтай болно">
                <ul className="list-disc space-y-1 pl-5">{hints.map((h) => <li key={h.key}><strong>{h.label}</strong> — {h.why}</li>)}</ul>
              </Alert>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-navy-900">Таны зорилго <span className="text-danger-600" aria-hidden>*</span></legend>
              <div className="space-y-1">
                {OBJECTIVES.map((o) => {
                  const list = Array.isArray(values.objectives) ? (values.objectives as string[]) : [];
                  return (
                    <label key={o} className="flex min-h-11 items-start gap-3 text-sm">
                      <input type="checkbox" checked={list.includes(o)} onChange={(e) => set("objectives", e.target.checked ? [...list, o] : list.filter((x) => x !== o))} className="mt-1 h-5 w-5 accent-navy-900" />
                      <span>{L.mn.objective[o]}</span>
                    </label>
                  );
                })}
              </div>
              {errors.objectives && <p className="mt-1 text-sm font-medium text-danger-600">{errors.objectives}</p>}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              {F("budgetMin", "Төсөв — доод хязгаар (₮)", { mode: "numeric" })}
              {F("budgetMax", "Төсөв — дээд хязгаар (₮)", { mode: "numeric" })}
            </div>
            {S("timeframe", "Хүссэн хугацаа", options("mn", "timeframe"), { required: true })}
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            {summarize(values, signedIn).map((sec) => (
              <Card key={sec.title}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-navy-900">{sec.title}</h3>
                  <button type="button" onClick={() => setStep(sec.step)} className={buttonClass("ghost", "sm")}>Засах</button>
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {sec.items.map((i) => (
                    <div key={i.label}><dt className="text-xs font-semibold uppercase text-muted">{i.label}</dt><dd className="break-words">{i.value}</dd></div>
                  ))}
                </dl>
              </Card>
            ))}
            {!signedIn && (
              <Field name="password" label="Нууц үг үүсгэх" error={errors.password} hint="Дор хаяж 8 тэмдэгт. Төслийн явцаа харахад ашиглана." required>
                {(id, aria) => <input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => { const n = { ...p }; delete n.password; return n; }); }} className={cx(CTRL, errors.password ? "border-danger-600" : "border-navy-200")} {...aria} />}
              </Field>
            )}
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" checked={values.consent === true} onChange={(e) => set("consent", e.target.checked)} className="mt-1 h-5 w-5 accent-navy-900" />
              <span>Миний оруулсан мэдээллийг үнэлгээ, үнийн санал авахын тулд боловсруулахыг зөвшөөрч байна. <span className="text-danger-600" aria-hidden>*</span></span>
            </label>
            {errors.consent && <p className="text-sm font-medium text-danger-600">{errors.consent}</p>}
            <Alert tone="info">Илгээсний дараа гарах тооцоо нь <strong>урьдчилсан тооцоо</strong> бөгөөд үнийн санал биш.</Alert>
          </div>
        );
    }
  })();

  return (
    <div>
      <ol className="mb-4 flex gap-1" aria-label="Алхамууд">
        {STEP_TITLES.map((t, i) => (
          <li key={t} aria-current={i === step ? "step" : undefined} className={cx("flex-1 rounded-md px-1 py-1.5 text-center text-xs", i === step ? "bg-sun-400 font-semibold text-navy-950" : i < step ? "bg-leaf-100 text-leaf-800" : "bg-navy-100 text-muted")}>
            <span className="hidden sm:inline">{i + 1}. </span>{t}
          </li>
        ))}
      </ol>
      {restored && (
        <Alert tone="info" className="mb-4">
          Өмнө бөглөсөн ноорог сэргээгдлээ. <button type="button" onClick={reset} className="font-semibold underline">Шинээр эхлэх</button>
        </Alert>
      )}
      <div aria-live="polite" role="status">
        {(errList.length > 0 || formError) && (
          <Alert tone="danger" title={formError ?? "Доорх талбаруудыг засна уу"} className="mb-4">
            {errList.length > 0 && <ul className="list-disc pl-5">{errList.map(([k, m]) => <li key={k}>{m}</li>)}</ul>}
          </Alert>
        )}
      </div>
      <Card>
        <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-lg font-semibold text-navy-900 outline-none">
          {step + 1}/{STEP_COUNT} · {STEP_TITLES[step]}
        </h2>
        <form onSubmit={(e) => { e.preventDefault(); if (step === STEP_COUNT - 1) void submit(); else next(); }} noValidate>
          {stepBody}
          <div className="mt-6 flex flex-wrap justify-between gap-3">
            {step > 0 ? <button type="button" onClick={() => { setErrors({}); setStep(step - 1); }} className={buttonClass("secondary")}>Буцах</button> : <span />}
            {step < STEP_COUNT - 1 ? (
              <button type="submit" className={buttonClass("primary")}>Үргэлжлүүлэх</button>
            ) : (
              <button type="submit" disabled={busy} aria-busy={busy} className={buttonClass("sun", "lg")}>{busy ? "Илгээж байна…" : "Хүсэлт илгээх"}</button>
            )}
          </div>
        </form>
      </Card>
      {!signedIn && <p className="mt-4 text-center text-sm text-muted">Бүртгэлтэй юу? <Link href="/login" className="underline">Нэвтрэх</Link></p>}
    </div>
  );
}

function Field({ name, label, error, hint, required, children }: { name: string; label: string; error?: string; hint?: string; required?: boolean; children: (id: string, aria: Record<string, string | boolean | undefined>) => ReactNode }) {
  const id = useId();
  const aria = { "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-e` : hint ? `${id}-h` : undefined, name };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-navy-900">{label}{required && <span className="text-danger-600" aria-hidden="true"> *</span>}</label>
      {children(id, aria)}
      {hint && !error && <p id={`${id}-h`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-e`} className="mt-1 text-sm font-medium text-danger-600">{error}</p>}
    </div>
  );
}
