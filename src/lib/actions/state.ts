/** Result shape returned by every form server action; consumed by <ActionForm>. */
export interface FormState {
  /** null = not submitted yet. */
  ok: boolean | null;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values echoed back on failure so the form does not lose the user's input. Passwords are never echoed. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = { ok: null };
