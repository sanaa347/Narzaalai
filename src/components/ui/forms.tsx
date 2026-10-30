"use client";

import { createContext, useActionState, useContext, useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initialFormState, type FormState } from "@/lib/actions/state";
import { Alert, buttonClass, cx, type ButtonVariant } from "./primitives";

const FormCtx = createContext<FormState>(initialFormState);

export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * <form> bound to a server action. Shows the action's success/error message, and exposes field errors and the echoed
 * values to the field components below. Works without client JS validation: the server is the source of truth.
 */
export function ActionForm({ action, children, className, noticeClassName }: { action: FormAction; children: ReactNode; className?: string; noticeClassName?: string }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <FormCtx.Provider value={state}>
      <form action={formAction} className={cx("space-y-4", className)} noValidate={false}>
        {state.ok === false && state.message && (
          <Alert tone="danger" role="alert" className={noticeClassName}>
            {state.message}
          </Alert>
        )}
        {state.ok === true && state.message && (
          <Alert tone="success" role="status" className={noticeClassName}>
            {state.message}
          </Alert>
        )}
        {children}
      </form>
    </FormCtx.Provider>
  );
}

function useField(name: string) {
  const s = useContext(FormCtx);
  return { error: s.ok === false ? s.fieldErrors?.[name] : undefined, echoed: s.ok === false ? s.values?.[name] : undefined };
}

interface BaseProps {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

const CONTROL =
  "block w-full rounded-lg border bg-white px-3 py-2 text-base text-ink placeholder:text-navy-300 focus:border-navy-700 disabled:bg-navy-50 sm:text-sm min-h-11";

function Shell({ id, label, hint, required, error, className, children }: { id: string; label: ReactNode; hint?: ReactNode; required?: boolean; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-navy-900">
        {label}
        {required && <span className="text-danger-600" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-sm font-medium text-danger-600">{error}</p>}
    </div>
  );
}

const aria = (id: string, error?: string, hint?: ReactNode) => ({
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-err` : hint ? `${id}-hint` : undefined,
});

export function TextField({
  name, label, hint, required, className, type = "text", defaultValue, placeholder, inputMode, autoComplete, min, max, step, maxLength, disabled,
}: BaseProps & { type?: string; defaultValue?: string | number | null; placeholder?: string; inputMode?: "text" | "numeric" | "decimal" | "tel" | "email"; autoComplete?: string; min?: string | number; max?: string | number; step?: string | number; maxLength?: number; disabled?: boolean }) {
  const id = useId();
  const { error, echoed } = useField(name);
  return (
    <Shell id={id} label={label} hint={hint} required={required} error={error} className={className}>
      <input
        id={id} name={name} type={type} required={required} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete}
        min={min} max={max} step={step} maxLength={maxLength} disabled={disabled}
        defaultValue={type === "password" ? undefined : (echoed ?? defaultValue ?? "")}
        className={cx(CONTROL, error ? "border-danger-600" : "border-navy-200")}
        {...aria(id, error, hint)}
      />
    </Shell>
  );
}

export function TextAreaField({ name, label, hint, required, className, defaultValue, rows = 3, placeholder, maxLength }: BaseProps & { defaultValue?: string | null; rows?: number; placeholder?: string; maxLength?: number }) {
  const id = useId();
  const { error, echoed } = useField(name);
  return (
    <Shell id={id} label={label} hint={hint} required={required} error={error} className={className}>
      <textarea
        id={id} name={name} rows={rows} required={required} placeholder={placeholder} maxLength={maxLength}
        defaultValue={echoed ?? defaultValue ?? ""}
        className={cx(CONTROL, error ? "border-danger-600" : "border-navy-200")}
        {...aria(id, error, hint)}
      />
    </Shell>
  );
}

export function SelectField({ name, label, hint, required, className, options, defaultValue, placeholder, disabled }: BaseProps & { options: { value: string; label: string }[]; defaultValue?: string | null; placeholder?: string; disabled?: boolean }) {
  const id = useId();
  const { error, echoed } = useField(name);
  return (
    <Shell id={id} label={label} hint={hint} required={required} error={error} className={className}>
      <select
        id={id} name={name} required={required} disabled={disabled} defaultValue={echoed ?? defaultValue ?? ""}
        className={cx(CONTROL, error ? "border-danger-600" : "border-navy-200")}
        {...aria(id, error, hint)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Shell>
  );
}

export function CheckField({ name, label, hint, defaultChecked, value = "on", className }: { name: string; label: ReactNode; hint?: ReactNode; defaultChecked?: boolean; value?: string; className?: string }) {
  const id = useId();
  const { error } = useField(name);
  return (
    <div className={className}>
      <label htmlFor={id} className="flex min-h-11 items-start gap-3 text-sm text-navy-900">
        <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-1 h-5 w-5 shrink-0 rounded border-navy-300 accent-navy-900" {...aria(id, error, hint)} />
        <span>
          {label}
          {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
        </span>
      </label>
      {error && <p id={`${id}-err`} className="ml-8 text-sm font-medium text-danger-600">{error}</p>}
    </div>
  );
}

export function FileField({ name, label, hint, required, accept, className }: BaseProps & { accept?: string }) {
  const id = useId();
  const { error } = useField(name);
  return (
    <Shell id={id} label={label} hint={hint} required={required} error={error} className={className}>
      <input
        id={id} name={name} type="file" required={required} accept={accept}
        className={cx("block w-full rounded-lg border bg-white text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:border-0 file:bg-navy-900 file:px-4 file:text-sm file:font-medium file:text-white", error ? "border-danger-600" : "border-navy-200")}
        {...aria(id, error, hint)}
      />
    </Shell>
  );
}

export function SubmitButton({ children, variant = "primary", pendingLabel, className, size = "md" }: { children: ReactNode; variant?: ButtonVariant; pendingLabel?: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending ? (pendingLabel ?? "…") : children}
    </button>
  );
}

/**
 * Destructive/irreversible-action button. Opens a native <dialog> and only submits the surrounding form after the user confirms.
 */
export function ConfirmSubmit({
  children, title, message, confirmLabel, cancelLabel = "Cancel", variant = "danger", size = "md",
}: { children: ReactNode; title: string; message: ReactNode; confirmLabel: string; cancelLabel?: string; variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();
  const titleId = useId();
  return (
    <>
      <button ref={trigger} type="button" disabled={pending} className={buttonClass(variant, size)} onClick={() => dialog.current?.showModal()}>
        {children}
      </button>
      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto w-[min(92vw,26rem)] rounded-xl border border-navy-200 bg-white p-0 shadow-xl">
        <div className="p-5">
          <h3 id={titleId} className="text-base font-semibold text-navy-900">{title}</h3>
          <div className="mt-2 text-sm text-muted">{message}</div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={buttonClass("secondary")} onClick={() => dialog.current?.close()} autoFocus>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={buttonClass(variant)}
              onClick={() => {
                dialog.current?.close();
                trigger.current?.form?.requestSubmit();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
