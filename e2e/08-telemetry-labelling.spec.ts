import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { accounts, body, login, newPage, SEED_PASSWORD } from "./helpers";

/**
 * No equipment integration exists in this build, so nothing may ever be shown as a live device reading. This inserts
 * rows straight into the SCRATCH database (as a script or import could) and checks how the rendered page describes them.
 * Runs after 06 (which asserts the empty state) and removes its rows afterwards.
 */

const SCRATCH_DB = ".tmp/e2e/e2e.db";

test("a simulated reading is labelled DEMO DATA; a row claiming to be real, with no registered integration, is 'unverified' and never 'Device reading'", async ({ browser }) => {
  const db = new Database(SCRATCH_DB);
  const ids = [randomUUID(), randomUUID()];
  try {
    const site = (db.prepare("SELECT id FROM sites LIMIT 1").get() as { id: string }).id;
    const ins = db.prepare(
      "INSERT INTO telemetry_points (id, site_id, asset_id, source, metric, value, unit, measured_at, quality, is_simulated) VALUES (?,?,NULL,?,?,?,?,?,?,?)",
    );
    ins.run(ids[0], site, "e2e-demo-generator", "pv_generation_kw", 1.5, "kW", "2026-10-28T03:00:00.000Z", "unknown", 1);
    ins.run(ids[1], site, "e2e-rogue-source", "battery_soc_percent", 77, "%", "2026-10-28T03:05:00.000Z", "good", 0);

    const { ctx, page } = await newPage(browser);
    try {
      await login(page, accounts.staff, SEED_PASSWORD);
      await page.goto("/ops/monitoring");
      const simulated = page.locator("tbody tr", { hasText: "e2e-demo-generator" });
      await expect(simulated).toContainText("DEMO DATA — NOT LIVE EQUIPMENT DATA");
      const rogue = page.locator("tbody tr", { hasText: "e2e-rogue-source" });
      await expect(rogue).toContainText("Unverified origin");
      await expect(rogue).not.toContainText("Device reading");
      await expect(body(page)).not.toContainText("Device reading");
      await expect(body(page)).toContainText("No live equipment integration is configured");
    } finally { await ctx.close(); }
  } finally {
    db.prepare("DELETE FROM telemetry_points WHERE id IN (?, ?)").run(ids[0], ids[1]);
    db.close();
  }
});
