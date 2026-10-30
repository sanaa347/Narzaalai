/** Expected, user-presentable failures (validation, permission, workflow rules). Anything else is a bug. */
export type DomainErrorCode = "invalid" | "forbidden" | "not_found" | "conflict" | "workflow";

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: DomainErrorCode = "invalid",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
