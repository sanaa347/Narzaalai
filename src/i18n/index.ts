import { labels as mnLabels } from "./mn/labels";
import { labels as enLabels } from "./en/labels";

export { statusInfo } from "./mn/status-info";

export type Locale = "mn" | "en";
export const DEFAULT_LOCALE: Locale = "mn";

/** Customer pages use `mn`; the Operations Control Center uses `en` (internal tool). Add locales here. */
export const L = { mn: mnLabels, en: enLabels } as const;

type Group = keyof typeof mnLabels;

/** Looks up a label; falls back to the raw key so an unknown/new value is visible rather than blank. */
export function lab(locale: Locale, group: Group, key: string | null | undefined): string {
  if (key == null || key === "") return "—";
  const map = L[locale][group] as Record<string, string>;
  return map[key] ?? key;
}

export const mnLab = (group: Group, key: string | null | undefined) => lab("mn", group, key);
export const enLab = (group: Group, key: string | null | undefined) => lab("en", group, key);

/** Options for <select> controls built from a label group. */
export function options(locale: Locale, group: Group, only?: readonly string[]): { value: string; label: string }[] {
  const map = L[locale][group] as Record<string, string>;
  return Object.entries(map)
    .filter(([k]) => !only || only.includes(k))
    .map(([value, label]) => ({ value, label }));
}
