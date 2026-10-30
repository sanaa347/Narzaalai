# Narzaalai MVP — implementation plan

## Inspection result (Phase 0)
- Repository contained a partial scaffold: Next.js 16 (App Router) + TypeScript + Tailwind 4, **SQLite via better-sqlite3**,
  SQL migration `001_init.sql`, custom session auth (scrypt, hashed session tokens), and pure domain libraries
  (money, quote totals, project status machine, preliminary sizing, assessment validation). No UI, no seed, no tests.
- Decision: **keep this stack.** It runs locally with zero credentials (the hosted Supabase credentials are not available),
  all rules are enforced server-side, and every domain module is pure and testable. Supabase/Postgres is documented as the
  hosted path (see README → Deployment); the schema and service boundaries were written so the SQL ports 1:1.
- Existing `tsc` errors in `permissions.ts` (type-guard narrowing to `never`) were fixed first.

## Architecture (modular monolith)
```
src/lib/domain/       pure rules: money, quote totals/freshness, status machine, comparison, attention flags
src/lib/solar/        calculation-service abstraction + preliminary sizing (versioned, reproducible)
src/lib/validation/   zod schemas (shared by wizard step validation and server validation)
src/lib/auth/         sessions, password hashing, pure permission predicates
src/lib/services/     business logic + data access (take `db` and `actor` explicitly → unit-testable)
src/lib/integrations/ device/telemetry boundary (interfaces only; no live integration exists)
src/app/              routes: public, /dashboard (customer), /ops (staff), /api/documents
src/components/       design-system primitives + feature components
src/i18n/             Mongolian (default) dictionary; English slot ready
db/migrations/        SQL migrations;  scripts/ migrate + seed
tests/                vitest unit + service-level integration tests (in-memory SQLite)
```

## Build order
1. Foundation: fix typecheck, step validation, domain additions (compare, attention), i18n, design system.
2. Services: assessment submission, workflow/status, quotes, suppliers/products, proposals, documents, assets.
3. Customer journey: landing → wizard → confirmation → plan → dashboard → proposal approval.
4. Control Center: overview, inbox, assessment/project detail, customers, suppliers, products, quotes, comparison, projects, settings.
5. Tests, browser verification, README, handover report.

## Integrity rules enforced in code (not only in copy)
- Money = integer minor units + explicit currency; quote totals recomputed server-side.
- A quote is a *confirmed offer* only if `source_type = supplier_quotation`, status `received`, and `valid_until` not passed.
- `APPROVED` can only be reached through the recorded proposal-approval workflow; `COMPLETED` needs commissioning/handover evidence.
- Suppliers are `verified` installers only when qualification evidence text is recorded (DB CHECK + service check).
- Warranty `evidence_recorded` requires an attached document. No serial numbers/warranties are ever generated.
- Demo records carry `is_demo = 1` and are visibly labelled everywhere they render.
