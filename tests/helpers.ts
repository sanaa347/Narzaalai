import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, newId, type Db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { loadActor, type SessionUser } from "@/lib/auth/session";
import { submitAssessment } from "@/lib/services/assessment";

export function makeDb(): Db {
  process.env.NARZAALAI_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nz-test-"));
  return openDb(":memory:");
}

export function makeStaff(db: Db, role: "staff" | "admin" = "staff", name = "Test Staff"): SessionUser {
  const id = newId();
  db.prepare("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?,?,?,?,?)").run(id, name, `${id}@staff.test`, hashPassword("correct-horse-battery"), role);
  return loadActor(db, id)!;
}

export const householdPayload = (over: Record<string, unknown> = {}) => ({
  customerType: "household", province: "Төв", locationDescription: "Тест байршил", propertyType: "detached_house", ownership: "owner",
  monthlyKwh: "400", backupNeeded: "no", objectives: ["reduce_costs"], timeframe: "3_6_months", consent: true, usageUnknown: false, ...over,
});

export const businessPayload = (over: Record<string, unknown> = {}) => ({
  ...householdPayload({ customerType: "business", propertyType: "shop" }),
  businessName: "Тест ХХК", businessCategory: "Дэлгүүр", businessOperatingHours: "09-18", businessUsagePattern: "Өдрийн цагаар", ...over,
});

let n = 0;
export function makeCustomer(db: Db, payload: Record<string, unknown> = householdPayload()) {
  n += 1;
  const res = submitAssessment(db, payload, { fullName: `Customer ${n}`, phone: "+976 99112233", email: `customer${n}-${newId()}@test.test`, password: "longenoughpass" }, null);
  return { ...res, actor: loadActor(db, res.userId)! };
}

export const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
