import { Alert, cx } from "@/components/ui/primitives";
import { MAIN_PATH, type ProjectStatus } from "@/lib/domain/status";
import { mnLab } from "@/i18n";

/** Progress over the main path. Side statuses (needs info, delayed, cancelled…) are explained separately. */
export function ProgressStepper({ status, resumeStatus }: { status: ProjectStatus; resumeStatus: ProjectStatus | null }) {
  let current = MAIN_PATH.indexOf(status);
  let note: string | null = null;
  if (status === "NEEDS_INFO") { current = 0; note = "Одоогоор нэмэлт мэдээлэл хүлээж байна."; }
  else if (status === "DELAYED") { current = resumeStatus ? MAIN_PATH.indexOf(resumeStatus) : -1; note = "Төсөл түр хойшилсон."; }
  else if (status === "MAINTENANCE") { current = MAIN_PATH.length - 1; note = "Систем засвар үйлчилгээнд байна."; }
  else if (status === "CANCELLED" || status === "REJECTED") { current = -1; }

  return (
    <div>
      {(status === "CANCELLED" || status === "REJECTED") && (
        <Alert tone="danger" className="mb-3">Төсөл «{mnLab("status", status)}» төлөвтэй тул цаашид үргэлжлэхгүй.</Alert>
      )}
      {note && <Alert tone="warn" className="mb-3">{note}</Alert>}
      <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Төслийн явц">
        {MAIN_PATH.map((s, i) => {
          const done = current >= 0 && i < current;
          const isCur = i === current;
          return (
            <li
              key={s}
              aria-current={isCur ? "step" : undefined}
              className={cx(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                isCur && "border-sun-500 bg-sun-100 font-semibold text-navy-950",
                done && "border-leaf-600/30 bg-leaf-50 text-leaf-800",
                !isCur && !done && "border-navy-100 bg-white text-muted",
              )}
            >
              <span aria-hidden="true" className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold", done ? "bg-leaf-600 text-white" : isCur ? "bg-sun-400 text-navy-950" : "bg-navy-100 text-navy-700")}>
                {done ? "✓" : i + 1}
              </span>
              <span>{mnLab("status", s)}</span>
              <span className="sr-only">{done ? " — дууссан" : isCur ? " — одоогийн үе шат" : " — хүлээгдэж байна"}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
