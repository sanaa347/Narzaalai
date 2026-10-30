import type { SessionUser } from "@/lib/auth/session";
import { isAdmin, isStaff } from "@/lib/auth/permissions";
import { DomainError } from "@/lib/domain/errors";

export function actorLabel(a: SessionUser): string {
  if (isAdmin(a)) return `Admin: ${a.fullName}`;
  if (isStaff(a)) return `Staff: ${a.fullName}`;
  if (a.role === "supplier") return `Supplier: ${a.fullName}`;
  return `Customer: ${a.fullName}`;
}

export function requireStaffActor(a: SessionUser | null | undefined): SessionUser {
  if (!a || !isStaff(a)) throw new DomainError("You do not have permission to perform this action.", "forbidden");
  return a;
}

export function requireAdminActor(a: SessionUser | null | undefined): SessionUser {
  if (!a || !isAdmin(a)) throw new DomainError("Only an administrator can perform this action.", "forbidden");
  return a;
}
