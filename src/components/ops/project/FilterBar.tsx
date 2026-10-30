import { buttonClass } from "@/components/ui/primitives";
import { L } from "@/i18n";
import { PROJECT_STATUSES } from "@/lib/domain/status";

const CONTROL = "min-h-11 w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm";

/** Plain GET form: works without JavaScript. `hidden` carries fixed params such as the inbox status chip. */
export function FilterBar({
  action, values, staff, showStatus = true, hidden = {},
}: {
  action: string;
  values: { q: string; status: string; owner: string; attention: string };
  staff: { id: string; full_name: string }[];
  showStatus?: boolean;
  hidden?: Record<string, string>;
}) {
  return (
    <form method="get" action={action} role="search" aria-label="Filter projects" className="mb-4 grid gap-3 rounded-xl border border-navy-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="text-xs font-semibold text-muted">Search
        <input name="q" defaultValue={values.q} placeholder="Reference, customer, phone, province…" className={CONTROL + " mt-1 font-normal"} />
      </label>
      {showStatus ? (
        <label className="text-xs font-semibold text-muted">Status
          <select name="status" defaultValue={values.status} className={CONTROL + " mt-1 font-normal"}>
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{L.en.status[s]}</option>)}
          </select>
        </label>
      ) : <div className="hidden lg:block" />}
      <label className="text-xs font-semibold text-muted">Owner
        <select name="owner" defaultValue={values.owner} className={CONTROL + " mt-1 font-normal"}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-muted">Attention
        <select name="attention" defaultValue={values.attention} className={CONTROL + " mt-1 font-normal"}>
          <option value="">Any</option>
          <option value="overdue">Overdue</option>
          <option value="blocked">Blocked</option>
          <option value="unassigned">Unassigned</option>
          <option value="open_info">Awaiting customer</option>
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className={buttonClass("primary")}>Apply</button>
        <a href={action} className={buttonClass("ghost")}>Reset</a>
      </div>
    </form>
  );
}
