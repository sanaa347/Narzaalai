import Link from "next/link";
import type { ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(" ");

export type ButtonVariant = "primary" | "sun" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-700 border border-navy-900",
  sun: "bg-sun-400 text-navy-950 hover:bg-sun-300 border border-sun-500 font-semibold",
  secondary: "bg-white text-navy-900 hover:bg-navy-50 border border-navy-200",
  ghost: "bg-transparent text-navy-900 hover:bg-navy-100 border border-transparent",
  danger: "bg-danger-600 text-white hover:bg-danger-800 border border-danger-600",
};
const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm min-h-9",
  md: "px-4 py-2 text-sm min-h-11",
  lg: "px-6 py-3 text-base min-h-12",
};

/** Class string shared by <button>, <Link> and form submit buttons. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 no-underline",
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

export function LinkButton({
  href, variant = "secondary", size = "md", className, children, ...rest
}: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode } & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Card({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx("rounded-xl border border-navy-100 bg-white p-4 shadow-sm sm:p-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardTitle({ children, actions, id }: { children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="text-base font-semibold text-navy-900">{children}</h2>
      {actions}
    </div>
  );
}

export type Tone = "neutral" | "info" | "success" | "warn" | "danger" | "demo" | "sun";

const BADGE: Record<Tone, string> = {
  neutral: "bg-navy-100 text-navy-900",
  info: "bg-navy-900 text-white",
  success: "bg-leaf-100 text-leaf-800",
  warn: "bg-sun-100 text-sun-800",
  danger: "bg-danger-100 text-danger-800",
  demo: "bg-white text-sun-800 border border-dashed border-sun-500",
  sun: "bg-sun-400 text-navy-950",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", BADGE[tone], className)}>
      {children}
    </span>
  );
}

/** Visible marker on every demo/sample record. Never remove it from seeded data. */
export function DemoBadge({ lang = "mn" }: { lang?: "mn" | "en" }) {
  return (
    <Badge tone="demo" title={lang === "mn" ? "Энэ нь жишээ өгөгдөл, бодит бүртгэл биш" : "Sample data — not a real record"}>
      {lang === "mn" ? "ДЕМО · бодит биш" : "DEMO · not real"}
    </Badge>
  );
}

const ALERT: Record<"info" | "success" | "warn" | "danger", string> = {
  info: "border-navy-200 bg-navy-50 text-navy-900",
  success: "border-leaf-600/40 bg-leaf-50 text-leaf-800",
  warn: "border-sun-500/60 bg-sun-100 text-sun-800",
  danger: "border-danger-600/40 bg-danger-50 text-danger-800",
};

export function Alert({ tone = "info", title, children, className, role }: { tone?: "info" | "success" | "warn" | "danger"; title?: string; children?: ReactNode; className?: string; role?: "alert" | "status" }) {
  return (
    <div role={role ?? (tone === "danger" ? "alert" : undefined)} className={cx("rounded-lg border px-4 py-3 text-sm", ALERT[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-200 bg-white px-6 py-10 text-center">
      <p className="text-base font-semibold text-navy-900">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-prose text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow, badges }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; badges?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">{title}</h1>
          {badges}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Label/value grid. Unknown values render as an em dash, never as zero. */
export function DefList({ items, cols = 2 }: { items: { label: ReactNode; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3 text-sm", cols === 1 && "grid-cols-1", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-navy-950">{it.value === null || it.value === undefined || it.value === "" ? <span className="text-muted">—</span> : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontally scrollable table wrapper (tables stay usable on phones). */
export function TableWrap({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-100 bg-white shadow-sm" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cx("whitespace-nowrap border-b border-navy-100 bg-navy-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted", className)}>{children}</th>
);
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cx("border-b border-navy-100 px-3 py-2.5 align-top", className)}>{children}</td>
);

export function Pagination({ page, pageSize, total, basePath, params = {} }: { page: number; pageSize: number; total: number; basePath: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{total} · {page}/{pages}</span>
      <div className="flex gap-2">
        {page > 1 ? <LinkButton href={href(page - 1)} size="sm">←</LinkButton> : <span className={buttonClass("secondary", "sm", "opacity-50")} aria-disabled>←</span>}
        {page < pages ? <LinkButton href={href(page + 1)} size="sm">→</LinkButton> : <span className={buttonClass("secondary", "sm", "opacity-50")} aria-disabled>→</span>}
      </div>
    </nav>
  );
}

export function SunMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="6" fill="#f5b700" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={16 + Math.cos(a) * 9.5} y1={16 + Math.sin(a) * 9.5} x2={16 + Math.cos(a) * 13} y2={16 + Math.sin(a) * 13} stroke="#f5b700" strokeWidth="2.2" strokeLinecap="round" />;
      })}
    </svg>
  );
}

export function Brand({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className={cx("inline-flex items-center gap-2 no-underline", inverted ? "text-white" : "text-navy-900")} aria-label="Нарзаалай — нүүр хуудас">
      <SunMark />
      <span className="text-lg font-bold tracking-tight">Нарзаалай</span>
    </Link>
  );
}
