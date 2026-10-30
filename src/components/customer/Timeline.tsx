import { EmptyState } from "@/components/ui/primitives";
import { fmtDateTime } from "@/lib/format";
import { mnLab } from "@/i18n";
import type { EventView } from "@/lib/services/projects";

/** Customer-visible events, newest first. Internal events/notes are already filtered out by the service. */
export function Timeline({ events }: { events: EventView[] }) {
  if (events.length === 0) return <EmptyState title="Одоогоор бүртгэл алга" />;
  const list = [...events].reverse();
  return (
    <ol className="space-y-3">
      {list.map((e) => (
        <li key={e.id} className="rounded-lg border border-navy-100 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-navy-900">
              {mnLab("eventType", e.event_type)}
              {e.event_type === "STATUS_CHANGE" && e.new_status && (
                <span className="font-normal text-muted">
                  {" "}· {e.previous_status ? `${mnLab("status", e.previous_status)} → ` : ""}{mnLab("status", e.new_status)}
                </span>
              )}
            </p>
            <time dateTime={e.created_at} className="text-xs text-muted">{fmtDateTime(e.created_at)}</time>
          </div>
          {e.note && <p className="mt-1 whitespace-pre-line break-words text-navy-950">{e.note}</p>}
          <p className="mt-1 text-xs text-muted">{e.actor_label}</p>
        </li>
      ))}
    </ol>
  );
}
