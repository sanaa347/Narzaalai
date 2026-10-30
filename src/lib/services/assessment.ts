import { localDatePlusDays } from "@/lib/domain/dates";
import type { Db } from "@/lib/db";
import { newId, nextReference, nowIso } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import { exponentOf } from "@/lib/domain/money";
import { hashPassword } from "@/lib/auth/password";
import { loadActor, type SessionUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";
import { accountSchema, assessmentSchema, flattenIssues, missingFromAssessment, type AssessmentInput } from "@/lib/validation/assessment";
import type { PrelimInput } from "@/lib/solar/prelim";
import { prelimEstimator, runEstimate } from "@/lib/solar/estimator";

const toMinor = (n: number | undefined): number | null => (n === undefined ? null : Math.round(n * 10 ** exponentOf("MNT")));
const FIRST_REVIEW_DAYS = 2; // internal triage target; shown to staff as "next action due", not promised to customers

export interface SubmitResult {
  projectId: string;
  assessmentId: string;
  reference: string;
  userId: string;
  createdAccount: boolean;
}

export function prelimInputFrom(v: AssessmentInput): PrelimInput {
  return {
    monthlyKwh: v.monthlyKwh ?? null,
    backupNeeded: v.backupNeeded,
    installAreaM2: v.installAreaM2 ?? null,
    hasCoordinates: v.latitude !== undefined && v.longitude !== undefined,
    hasShadingInfo: !!v.shadingNotes,
    hasCriticalLoads: !!v.criticalLoads,
  };
}

function provenanceOf(v: AssessmentInput): Record<string, "customer_provided" | "unknown"> {
  const p = (x: unknown) => (x === undefined || x === "" ? "unknown" : "customer_provided");
  return {
    monthly_kwh: p(v.monthlyKwh),
    bill_amount: p(v.billAmount),
    coordinates: p(v.latitude),
    install_area: p(v.installAreaM2),
    shading: p(v.shadingNotes),
    major_loads: p(v.majorLoads),
    critical_loads: p(v.criticalLoads),
    budget: p(v.budgetMax ?? v.budgetMin),
  };
}

/**
 * Persists a complete assessment request: (account) → organization → site → energy profile → assessment → project → first event.
 * One transaction: either everything is saved or nothing is. Validation is repeated here regardless of any client checks.
 */
export function submitAssessment(db: Db, rawAssessment: unknown, rawAccount: unknown, actor: SessionUser | null): SubmitResult {
  const parsed = assessmentSchema.safeParse(rawAssessment);
  if (!parsed.success) throw new DomainError("Маягтын мэдээлэл дутуу эсвэл буруу байна.", "invalid", flattenIssues(parsed.error));
  const v = parsed.data;

  if (actor && isStaff(actor)) throw new DomainError("Ажилтан хэрэглэгчийн хүсэлт илгээх боломжгүй.", "forbidden");
  if (actor && actor.role !== "customer") throw new DomainError("Энэ хэрэглэгчийн төрөл хүсэлт илгээх боломжгүй.", "forbidden");

  let account: { fullName: string; phone: string; email: string; password: string } | null = null;
  if (!actor) {
    const a = accountSchema.safeParse(rawAccount);
    if (!a.success) throw new DomainError("Бүртгэлийн мэдээлэл буруу байна.", "invalid", flattenIssues(a.error));
    account = a.data;
    const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(account.email);
    if (exists) throw new DomainError("Энэ имэйл бүртгэлтэй байна. Нэвтэрч орсны дараа хүсэлтээ илгээнэ үү.", "conflict", { email: "Энэ имэйл бүртгэлтэй байна" });
  }

  const now = nowIso();
  const prelimInput = prelimInputFrom(v);
  const prelim = runEstimate(prelimEstimator, prelimInput);
  const missing = Array.from(new Set([...missingFromAssessment(v), ...prelim.missing]));
  const due = localDatePlusDays(FIRST_REVIEW_DAYS);

  const run = db.transaction((): SubmitResult => {
    let userId: string;
    let contactName: string;
    let contactPhone: string | null;
    let contactEmail: string;
    if (account) {
      userId = newId();
      db.prepare("INSERT INTO users (id, full_name, email, phone, password_hash, role) VALUES (?,?,?,?,?, 'customer')").run(
        userId, account.fullName, account.email, account.phone, hashPassword(account.password),
      );
      contactName = account.fullName; contactPhone = account.phone; contactEmail = account.email;
    } else {
      const u = db.prepare("SELECT id, full_name, email, phone FROM users WHERE id = ?").get(actor!.id) as
        { id: string; full_name: string; email: string; phone: string | null };
      userId = u.id; contactName = u.full_name; contactPhone = u.phone; contactEmail = u.email;
    }

    // Reuse the customer's own organization of the same type; otherwise create one.
    let orgId = (
      db.prepare(
        "SELECT o.id FROM organizations o JOIN org_members m ON m.org_id = o.id WHERE m.user_id = ? AND o.organization_type = ? ORDER BY o.created_at LIMIT 1",
      ).get(userId, v.customerType) as { id: string } | undefined
    )?.id;
    if (!orgId) {
      orgId = newId();
      const orgName = v.customerType === "business" ? (v.businessName ?? contactName) : contactName;
      db.prepare("INSERT INTO organizations (id, name, organization_type, contact_name, contact_phone, contact_email) VALUES (?,?,?,?,?,?)").run(
        orgId, orgName, v.customerType, contactName, contactPhone, contactEmail,
      );
      db.prepare("INSERT INTO org_members (org_id, user_id, member_role) VALUES (?,?, 'owner')").run(orgId, userId);
    }

    const siteId = newId();
    db.prepare(
      `INSERT INTO sites (id, org_id, province, district, city, location_description, property_type, address, latitude, longitude,
        ownership, install_area_note, install_area_m2, shading_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      siteId, orgId, v.province, v.district ?? null, v.city ?? null, v.locationDescription, v.propertyType, v.address ?? null,
      v.latitude ?? null, v.longitude ?? null, v.ownership, v.installAreaNote ?? null, v.installAreaM2 ?? null, v.shadingNotes ?? null,
    );

    const profileId = newId();
    db.prepare(
      `INSERT INTO energy_profiles (id, site_id, usage_known, monthly_kwh, bill_amount_minor, billing_period, utility_bill_note, major_loads,
        operating_hours, critical_loads, backup_needed, existing_equipment, business_name, business_category, business_operating_hours,
        business_usage_pattern, business_seasonal_pattern, business_critical_equipment, additional_sites_note, objectives,
        budget_min_minor, budget_max_minor, timeframe, provenance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      profileId, siteId, v.usageUnknown && v.monthlyKwh === undefined ? 0 : 1, v.monthlyKwh ?? null, toMinor(v.billAmount),
      v.billingPeriod ?? null, v.utilityBillNote ?? null, v.majorLoads ?? null, v.operatingHours ?? null, v.criticalLoads ?? null,
      v.backupNeeded, v.existingEquipment ?? null, v.businessName ?? null, v.businessCategory ?? null, v.businessOperatingHours ?? null,
      v.businessUsagePattern ?? null, v.businessSeasonalPattern ?? null, v.businessCriticalEquipment ?? null, v.additionalSitesNote ?? null,
      JSON.stringify(v.objectives), toMinor(v.budgetMin), toMinor(v.budgetMax), v.timeframe, JSON.stringify(provenanceOf(v)),
    );

    const reference = nextReference(db, "NZ");
    const assessmentId = newId();
    db.prepare(
      `INSERT INTO assessments (id, reference, org_id, site_id, energy_profile_id, verification_state, calc_version, input_snapshot,
        results, assumptions, missing_data, created_by) VALUES (?,?,?,?,?, 'preliminary', ?,?,?,?,?,?)`,
    ).run(
      assessmentId, reference, orgId, siteId, profileId, prelim.version, JSON.stringify(prelimInput), JSON.stringify(prelim),
      JSON.stringify(prelim.assumptions), JSON.stringify(missing), userId,
    );

    const projectId = newId();
    db.prepare(
      "INSERT INTO projects (id, reference, org_id, site_id, assessment_id, status, next_action_due) VALUES (?,?,?,?,?, 'SUBMITTED', ?)",
    ).run(projectId, reference.replace(/^NZ-/, "PRJ-"), orgId, siteId, assessmentId, due);

    db.prepare(
      `INSERT INTO project_events (id, project_id, event_type, previous_status, new_status, note, actor_id, actor_label, customer_visible, created_at)
       VALUES (?,?, 'SUBMITTED', NULL, 'SUBMITTED', NULL, ?, 'Customer', 1, ?)`,
    ).run(newId(), projectId, userId, now);

    return { projectId, assessmentId, reference, userId, createdAccount: !!account };
  });

  return run();
}

export { loadActor };
