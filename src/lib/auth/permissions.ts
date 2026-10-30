/**
 * Authorization rules as pure functions so they can be unit-tested without a request context.
 * Roles are always read from the database user record, never from client input.
 */
export type Role = "customer" | "staff" | "admin" | "supplier";

export interface Actor {
  id: string;
  role: Role;
  status: "active" | "disabled";
  supplierId: string | null;
  orgIds: readonly string[];
}

type MaybeActor = Actor | null | undefined;

const isActive = (a: MaybeActor): boolean => !!a && a.status === "active";

export function isStaff(a: MaybeActor): boolean {
  return !!a && isActive(a) && (a.role === "staff" || a.role === "admin");
}

/**
 * Which signed-in area a role may use. Roles without a portal (e.g. `supplier`, which has no UI yet) get null:
 * they must not be redirected between areas (that would loop) and are refused at login.
 */
export function portalFor(a: MaybeActor): "ops" | "dashboard" | null {
  if (!a || !isActive(a)) return null;
  if (isStaff(a)) return "ops";
  return a.role === "customer" ? "dashboard" : null;
}

export function isAdmin(a: MaybeActor): boolean {
  return !!a && isActive(a) && a.role === "admin";
}

export function canViewOrgData(a: MaybeActor, orgId: string): boolean {
  if (!a || !isActive(a)) return false;
  if (isStaff(a)) return true;
  return a.role === "customer" && a.orgIds.includes(orgId);
}

export function canAccessOperations(a: MaybeActor): boolean {
  return isStaff(a);
}

export function canManageUsers(a: MaybeActor): boolean {
  return isAdmin(a);
}

/** Suppliers see only their own quotations; customers never see raw quotations (only via published proposals). */
export function canViewQuote(a: MaybeActor, quote: { supplierId: string }): boolean {
  if (!a || !isActive(a)) return false;
  if (isStaff(a)) return true;
  return a.role === "supplier" && a.supplierId === quote.supplierId;
}

export function canViewDocument(
  a: MaybeActor,
  doc: { orgId: string | null; supplierId: string | null; access: "staff_only" | "customer_visible" },
): boolean {
  if (!a || !isActive(a)) return false;
  if (isStaff(a)) return true;
  if (a.role === "customer") return doc.access === "customer_visible" && doc.orgId !== null && a.orgIds.includes(doc.orgId);
  if (a.role === "supplier") return doc.supplierId !== null && doc.supplierId === a.supplierId && doc.orgId === null;
  return false;
}

/** Only a customer who belongs to the project's organization may approve a proposal on their own behalf. */
export function canApproveAsCustomer(a: MaybeActor, orgId: string): boolean {
  return !!a && isActive(a) && a.role === "customer" && a.orgIds.includes(orgId);
}
