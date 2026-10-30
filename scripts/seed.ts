/**
 * Development/demo seed. EVERY record created here is flagged is_demo = 1 and named "ДЕМО …".
 * Demo suppliers are fictional; their prices are illustrative and carry source type "demo" (never "supplier_quotation").
 * Refuses to run in production. Usage: npm run seed            (first time)
 *                                      npm run seed -- --reset (delete the local database file, then seed)
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { openDb, newId } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { loadActor, type SessionUser } from "../src/lib/auth/session";
import { submitAssessment } from "../src/lib/services/assessment";
import { changeStatus, recordMilestone, requestInfo, assignOwner, updateSchedule } from "../src/lib/services/workflow";
import { createSupplier } from "../src/lib/services/suppliers";
import { createProduct } from "../src/lib/services/products";
import { createQuote } from "../src/lib/services/quotes";
import { approveProposal, createProposalDraft, publishProposal } from "../src/lib/services/proposals";
import { saveDocument } from "../src/lib/services/documents";
import { addAsset, addWarranty } from "../src/lib/services/assets";
import { databaseMayHoldRealData } from "../src/lib/db/reset-guard";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data when NODE_ENV=production.");
  process.exit(1);
}

const dbFile = process.env.NARZAALAI_DB_PATH ?? "data/narzaalai.db";
if (process.argv.includes("--reset")) {
  if (databaseMayHoldRealData(dbFile) && !process.argv.includes("--force-delete-all-data")) {
    console.error(
      `Refusing to reset ${dbFile}: it contains non-demo records (or cannot be inspected).\n` +
        "--reset deletes the WHOLE database file. Point NARZAALAI_DB_PATH at a scratch database, or pass --force-delete-all-data if you really mean it.",
    );
    process.exit(1);
  }
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force: true });
  console.log(`Removed ${dbFile}`);
}
const db = openDb(dbFile);
if (db.prepare("SELECT 1 FROM users WHERE email = 'admin@demo.narzaalai.test'").get()) {
  console.log("Demo data already present. Run `npm run seed -- --reset` to rebuild it.");
  process.exit(0);
}

const generated = !process.env.SEED_PASSWORD;
const password = process.env.SEED_PASSWORD ?? crypto.randomBytes(9).toString("base64url");
if (password.length < 12) {
  console.error("SEED_PASSWORD must be at least 12 characters (staff accounts require it).");
  process.exit(1);
}
const hash = hashPassword(password);
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function mkStaff(name: string, email: string, role: "admin" | "staff"): SessionUser {
  const id = newId();
  db.prepare("INSERT INTO users (id, full_name, email, password_hash, role, is_demo) VALUES (?,?,?,?,?,1)").run(id, name, email, hash, role);
  return loadActor(db, id)!;
}
const admin = mkStaff("ДЕМО Админ", "admin@demo.narzaalai.test", "admin");
const ops = mkStaff("ДЕМО Операторч", "ops@demo.narzaalai.test", "staff");

// --- Demo suppliers (fictional) ---
const sup = (name: string, extra: Record<string, string>) =>
  createSupplier(db, ops, {
    companyName: name, installerCapability: "claimed", phone: "+976 00000000", email: `info+${crypto.randomBytes(3).toString("hex")}@demo-supplier.test`,
    internalNotes: "ДЕМО: зохиомол бизнес. Бодит түнш биш, үнэ жишээ.", ...extra,
  });
const supA = sup("ДЕМО Нар Системс ХХК (жишээ)", { serviceArea: "Улаанбаатар, Төв аймаг", offerings: "Нарны панель, инвертер, суурилуулалт", supportedBrands: "Demo-Brand A", warrantyTerms: "ДЕМО: бодит баталгаа биш" });
const supB = sup("ДЕМО Говийн Эрчим ХХК (жишээ)", { serviceArea: "Улаанбаатар, Дархан", offerings: "Бүрэн иж бүрдэл, батарей", supportedBrands: "Demo-Brand B", warrantyTerms: "ДЕМО: бодит баталгаа биш" });
const supC = sup("ДЕМО Хангай Солар ХХК (жишээ)", { serviceArea: "Хангайн бүс", offerings: "Хөдөөгийн жижиг системүүд", supportedBrands: "Demo-Brand C", warrantyTerms: "ДЕМО: бодит баталгаа биш" });
db.prepare("UPDATE suppliers SET is_demo = 1").run();

const prod = (supplierId: string, category: string, manufacturer: string, model: string, specs: string, price: string) =>
  createProduct(db, ops, { supplierId, category, manufacturer, model, specs, price, currency: "MNT", verificationState: "unverified", source: "ДЕМО жишээ үнэ — бодит үнэ биш", lastCheckedOn: day(0), compatibility: "" });
prod(supA, "pv_module", "Demo-Brand A", "DA-550M (demo)", "550 W, монокристалл (жишээ)", "420000");
prod(supA, "inverter", "Demo-Brand A", "DA-5K-HYB (demo)", "5 kW hybrid (жишээ)", "4200000");
prod(supB, "battery", "Demo-Brand B", "DB-LFP-5 (demo)", "5 kWh LFP (жишээ)", "5200000");
prod(supB, "pv_module", "Demo-Brand B", "DB-450M (demo)", "450 W (жишээ)", "350000");
db.prepare("UPDATE products SET is_demo = 1").run();

// --- Demo customers via the real submission flow ---
const base = {
  province: "Төв аймаг", district: "Зуунмод", city: "Зуунмод", locationDescription: "ДЕМО — жишээ байршил, бодит хаяг биш", ownership: "owner",
  usageUnknown: false, backupNeeded: "yes", objectives: ["reduce_costs", "backup"], timeframe: "3_6_months", consent: true,
};
const house = submitAssessment(db, {
  ...base, customerType: "household", propertyType: "detached_house", installAreaM2: "45", monthlyKwh: "380", majorLoads: "Хөргөгч, зурагт, угаалгын машин (ДЕМО)",
  criticalLoads: "Хөргөгч, гэрэлтүүлэг", shadingNotes: "Өмнө талд сүүдэр байхгүй (ДЕМО)", budgetMax: "15000000",
}, { fullName: "ДЕМО Өрхийн хэрэглэгч", phone: "+976 00000001", email: "household@demo.narzaalai.test", password }, null);
const shop = submitAssessment(db, {
  ...base, customerType: "business", propertyType: "shop", monthlyKwh: "1850", installAreaM2: "120", objectives: ["reduce_costs", "continuity"],
  businessName: "ДЕМО Жишээ дэлгүүр ХХК", businessCategory: "Хүнсний дэлгүүр", businessOperatingHours: "09:00–21:00",
  businessUsagePattern: "Өдрийн цагаар хөргөгч, гэрэлтүүлэг (ДЕМО)", businessCriticalEquipment: "Хөргөх тоног төхөөрөмж", budgetMax: "45000000", criticalLoads: "Хөргөгч",
}, { fullName: "ДЕМО Бизнесийн хэрэглэгч", phone: "+976 00000002", email: "business@demo.narzaalai.test", password }, null);
const ger = submitAssessment(db, {
  ...base, customerType: "household", propertyType: "ger", province: "Архангай", district: "Цэцэрлэг", usageUnknown: true, billAmount: "85000",
  billingPeriod: "2026 оны 9-р сар", backupNeeded: "unknown", objectives: ["exploring"], timeframe: "exploring", locationDescription: "ДЕМО — хөдөөгийн жишээ",
}, { fullName: "ДЕМО Гэр бүл", phone: "+976 00000003", email: "ger@demo.narzaalai.test", password }, null);
const completed = submitAssessment(db, {
  ...base, customerType: "household", propertyType: "detached_house", monthlyKwh: "420", installAreaM2: "50", shadingNotes: "Сүүдэргүй (ДЕМО)", criticalLoads: "Хөргөгч", majorLoads: "ДЕМО", budgetMax: "18000000",
}, { fullName: "ДЕМО Дууссан төсөл", phone: "+976 00000004", email: "completed@demo.narzaalai.test", password }, null);

for (const r of [house, shop, ger, completed]) {
  db.prepare("UPDATE organizations SET is_demo = 1, name = CASE WHEN name LIKE 'ДЕМО%' THEN name ELSE 'ДЕМО — ' || name END WHERE id = (SELECT org_id FROM projects WHERE id = ?)").run(r.projectId);
  db.prepare("UPDATE users SET is_demo = 1 WHERE id = ?").run(r.userId);
  db.prepare("UPDATE projects SET is_demo = 1 WHERE id = ?").run(r.projectId);
}

const lineSet = (n: number, panelUnit: string, invUnit: string, extra: object[] = []) => [
  { category: "pv_module", description: "PV модуль 550 Вт (ДЕМО)", manufacturer: "Demo-Brand", model: "DM-550", quantity: n, unitPrice: panelUnit },
  { category: "inverter", description: "Инвертер (ДЕМО)", manufacturer: "Demo-Brand", model: "DI-5K", quantity: 1, unitPrice: invUnit },
  { category: "mounting", description: "Бэхэлгээний иж бүрдэл (ДЕМО)", quantity: 1, unitPrice: "900000" },
  ...extra,
];
const demoQuote = (supplierId: string, projectId: string, reference: string, over: Record<string, unknown>) =>
  createQuote(db, ops, {
    supplierId, projectId, reference, quoteDate: day(-3), validUntil: day(30), currency: "MNT", sourceType: "demo", status: "received",
    sourceNote: "ДЕМО жишээ — бодит үнийн санал биш", stockStatus: "unknown", ...over,
  });

// 1) New request waiting for triage: `ger` (SUBMITTED, unassigned, usage unknown).
// 2) House: NEEDS_INFO with an open info request.
assignOwner(db, ops, house.projectId, ops.id);
changeStatus(db, ops, house.projectId, { to: "ASSESSMENT", note: "ДЕМО: анхны шалгалт" });
requestInfo(db, ops, house.projectId, "Цахилгааны төлбөрийн сүүлийн 3 сарын мэдээлэл, дээвэр/хашааны зургийг илгээнэ үү. (ДЕМО асуулт)");

// 3) Shop: QUOTE_REQUESTED with three demo quotes (one in USD to show mixed-currency handling).
assignOwner(db, ops, shop.projectId, ops.id);
changeStatus(db, ops, shop.projectId, { to: "ASSESSMENT", note: "ДЕМО" });
changeStatus(db, ops, shop.projectId, { to: "QUOTE_REQUESTED", note: "ДЕМО: 3 нийлүүлэгчээс санал авч байна", nextActionDue: day(-1) });
demoQuote(supA, shop.projectId, "DEMO-A-001", { lines: lineSet(10, "420000", "4200000"), installation: "2500000", delivery: "600000", taxes: "0", pvKwp: "5.5", inverterKw: "5", leadTimeDays: "21", warrantyTerms: "ДЕМО: жишээ нөхцөл", exclusions: "Газардуулга, сүлжээний зөвшөөрөл (ДЕМО)", installationAvailability: "ДЕМО: 3 долоо хоногийн дараа" });
demoQuote(supB, shop.projectId, "DEMO-B-001", { lines: lineSet(12, "350000", "3900000", [{ category: "battery", description: "Батарей 5 кВт·ц (ДЕМО)", manufacturer: "Demo-Brand B", model: "DB-LFP-5", quantity: 1, unitPrice: "5200000" }]), installation: "3000000", delivery: "800000", pvKwp: "5.4", batteryKwh: "5", inverterKw: "5", leadTimeDays: "35", stockStatus: "on_order", warrantyTerms: "ДЕМО: жишээ нөхцөл" });
demoQuote(supC, shop.projectId, "DEMO-C-001", { currency: "USD", lines: lineSet(10, "125.50", "1200.00"), installation: "700.00", delivery: "150.00", pvKwp: "5.5", inverterKw: "5", sourceNote: "ДЕМО жишээ (USD) — бодит үнэ биш" });

// 4) Completed project: full journey with two demo options, approved by the customer actor, installed, documented, in service.
assignOwner(db, ops, completed.projectId, ops.id);
changeStatus(db, ops, completed.projectId, { to: "ASSESSMENT", note: "ДЕМО" });
changeStatus(db, ops, completed.projectId, { to: "QUOTE_REQUESTED", note: "ДЕМО" });
const cq1 = demoQuote(supA, completed.projectId, "DEMO-A-002", { lines: lineSet(8, "420000", "4200000"), installation: "2200000", delivery: "500000", pvKwp: "4.4", inverterKw: "5", leadTimeDays: "14", warrantyTerms: "ДЕМО" });
const cq2 = demoQuote(supB, completed.projectId, "DEMO-B-002", { lines: lineSet(9, "350000", "3900000"), installation: "2600000", delivery: "700000", pvKwp: "4.05", inverterKw: "5", leadTimeDays: "28", warrantyTerms: "ДЕМО" });
const prop = createProposalDraft(db, ops, completed.projectId, {
  title: "ДЕМО санал — дөрвөн сая хүртэлх систем",
  summary: "Энэ нь демо өгөгдөл. Бодит нийлүүлэгчийн санал биш.",
  options: [
    { quoteId: cq1, label: "Хувилбар A", customerSummary: "ДЕМО: богино хугацаатай хувилбар" },
    { quoteId: cq2, label: "Хувилбар B", customerSummary: "ДЕМО: хямд панель" },
  ],
});
publishProposal(db, ops, prop);
approveProposal(db, loadActor(db, completed.userId), prop, cq1, { note: "ДЕМО батлалт" });
changeStatus(db, ops, completed.projectId, { to: "PROCUREMENT", note: "ДЕМО: худалдан авалт эхэллээ" });
updateSchedule(db, ops, completed.projectId, { scheduledInstallDate: day(-10), scheduleNotes: "ДЕМО" });
changeStatus(db, ops, completed.projectId, { to: "INSTALL_SCHEDULED", note: "ДЕМО" });
changeStatus(db, ops, completed.projectId, { to: "INSTALLATION", note: "ДЕМО" });
changeStatus(db, ops, completed.projectId, { to: "COMMISSIONING", note: "ДЕМО" });
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% DEMO commissioning report — NOT a real document\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const evidence = saveDocument(db, ops, { name: "demo-commissioning-report.pdf", mimeType: "application/pdf", bytes: pdf }, { projectId: completed.projectId, docType: "commissioning_report", customerVisible: true });
changeStatus(db, ops, completed.projectId, { to: "COMPLETED", note: "ДЕМО: хүлээлгэн өгсөн", documentId: evidence.id, noteVisibleToCustomer: true });
changeStatus(db, ops, completed.projectId, { to: "IN_SERVICE", note: "ДЕМО" });
const assetId = addAsset(db, ops, completed.projectId, { category: "inverter", manufacturer: "Demo-Brand", model: "DI-5K (demo)", commissioningState: "commissioned", installationDate: day(-9), installerSupplierId: supA, notes: "ДЕМО бүртгэл. Серийн дугаар оруулаагүй." });
addWarranty(db, ops, assetId, { provider: "ДЕМО Нар Системс ХХК (жишээ)", terms: "ДЕМО: бодит баталгаа биш. Нөхцөл баримтаар баталгаажаагүй." });
recordMilestone(db, ops, completed.projectId, { title: "Хэрэглэгчид зааварчилгаа өгсөн (ДЕМО)", customerVisible: true });
db.prepare("UPDATE installed_assets SET notes = notes WHERE id = ?").run(assetId);
void admin;

console.log("\nDemo data created (all flagged is_demo = 1).");
console.log("Accounts (password is shared by all demo accounts):");
for (const e of ["admin@demo.narzaalai.test (admin)", "ops@demo.narzaalai.test (staff)", "household@demo.narzaalai.test (customer — info request open)", "business@demo.narzaalai.test (customer — quotes being collected)", "ger@demo.narzaalai.test (customer — new request)", "completed@demo.narzaalai.test (customer — project in service)"]) console.log("  " + e);
console.log(generated ? `Password (generated, shown once): ${password}` : "Password: the value of SEED_PASSWORD.");
db.close();
