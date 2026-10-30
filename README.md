# Narzaalai (Нарзаалай) — solar ecosystem platform MVP

Customer assessment → staff review → supplier quotations → comparison → proposal → customer approval → project lifecycle
→ installed equipment and warranty records, in one modular monolith (Next.js 16, TypeScript, Tailwind 4, SQLite).

**Status: a working, tested pilot-grade MVP. It is not yet ready for real customers without the items in
[Remaining work](#remaining-work-before-real-customers-use-it).** Read `docs/SECURITY.md` and `docs/DEPLOYMENT.md` first.

| Document | Contents |
|---|---|
| `docs/DEPLOYMENT.md` | SQLite constraints, persistence, backup/restore (rehearsed), recommended hosting, reversible Postgres migration plan |
| `docs/SECURITY.md` | Authorization review, what is tested, defects found, known limitations |
| `docs/SOLAR_MODEL.md` | The sizing formula, constants, limitations, how a validated model would plug in |
| `docs/IMPLEMENTATION_PLAN.md` | Original architecture notes (the "Inspection result" section describes the starting point, not today's state) |

## Requirements
Node.js ≥ 20.19 (verified on 22), npm 10+. No external service is required: data is a local SQLite file.

## Setup
```bash
npm install
cp .env.example .env.local        # adjust; never commit
npm run migrate                   # create/upgrade the database from db/migrations (001–004)
npm run seed                      # OPTIONAL demo data; refuses NODE_ENV=production; add `-- --reset` to rebuild
npm run dev                       # http://localhost:3000
```
Production: `npm run build && npm start` (one process; see `docs/DEPLOYMENT.md`).

### Environment variables
| Variable | Purpose |
|---|---|
| `NARZAALAI_DB_PATH` | SQLite file (default `data/narzaalai.db`) |
| `NARZAALAI_UPLOAD_DIR` | Uploaded documents, served only through the authorised `/api/documents/[id]` route |
| `NARZAALAI_BACKUP_DIR`, `KEEP` | Used by `npm run backup` |
| `TRUSTED_PROXY_HOPS` | Reverse proxies you operate in front of the app (default 1; 0 if exposed directly); used for rate limiting |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | First admin, created by `npm run migrate` if none exists (password ≥ 12 chars). Remove afterwards |
| `SEED_PASSWORD` | Password for demo accounts (≥ 12 chars; seed only; generated and shown once if unset) |

### Accounts
* **Production:** the admin from `BOOTSTRAP_ADMIN_*`; the admin creates further staff in *Control Center → Settings*. Customers
  register by submitting an assessment. **There is no password reset yet.**
* **Demo (after `npm run seed`, all password = `SEED_PASSWORD`):** `admin@`, `ops@` (staff), `household@`, `business@`, `ger@`,
  `completed@` — all `@demo.narzaalai.test`. Every seeded record is `is_demo`, named "ДЕМО" and shows a "DEMO · not real"
  badge. Demo suppliers, prices and quotations are **fictional**.

## Commands
| Command | What it does |
|---|---|
| `npm run lint` · `npm run typecheck` · `npm test` | ESLint · `tsc --noEmit` · Vitest unit + service tests (in-memory SQLite) |
| `npm run check` | The three above |
| `npm run build` | Production build |
| `npm run e2e:install` | One-time: install the Chromium browser for Playwright |
| `npm run e2e` | Full browser/HTTP end-to-end suite (~2.5 min) |
| `npm run backup` | Verified online backup of the database (uploads must be copied separately) |

### The E2E suite (`e2e/`, `playwright.config.ts`)
Builds a production bundle into `.next-e2e` and serves it on **port 3101** with its own database and upload directory under
`.tmp/e2e/`, recreated on every run. `e2e/prepare.ts` **refuses to run** unless both paths are inside `.tmp/e2e/`, so it cannot
touch `data/` or any production path. Specs: `01` access control and sign-in · `02` household/business assessments and
validation · `03` quotations (MNT/USD exactness), proposals, customer approval, status transitions, completion evidence ·
`04` documents, isolation, uploads abuse, information requests · `05` equipment/warranty, layout at 390/768/1366 px ·
`06` demo labelling and technical honesty · `07` forged/replayed server actions and CSRF · `08` telemetry labelling.
Negative paths (invalid input, forged ids, illegal transitions, missing evidence, other customers, anonymous users) are
tested alongside the happy paths.

## Verified current state (2026-10-29, re-run from scratch)
| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | **189 passed** (16 files) |
| `npm run build` | pass |
| `npm run e2e` | **98 passed** (8 specs) |
| `npm run backup` + restore + `npm run migrate` | rehearsed: integrity `ok`, 0 foreign-key violations, data intact, guards active |

## What works (all covered by the tests above)
* **Customer:** Mongolian landing page; 5-step household/business wizard (browser-kept draft without the password, server-side
  validation, "I don't know" with missing-information hints); reference `NZ-YYYY-NNNNNN`; preliminary plan; dashboard,
  timeline, proposal view and approval, documents, equipment and warranty records.
* **Control Center (`/ops`):** overview from real counts, inbox, projects with filters and attention flags, project detail
  (notes, information requests, owner, schedule, milestones, documents, equipment/warranty, tickets, history), customers,
  suppliers, products, quotations, side-by-side comparison, monitoring boundary, settings and users (admin).
* **Integrity rules enforced in code and, for money, in the database:** money is integer minor units plus an explicit currency;
  totals recomputed on the server and guarded by triggers (migrations 003–004); only a *received supplier quotation within
  its validity date* is a confirmed offer; indicative, demo, expired and undated prices never are; `APPROVED` only through the
  recorded approval workflow; `COMPLETED` needs a commissioning/handover document; equipment cannot be recorded before
  Installation; suppliers are "verified" only with recorded evidence; no serial numbers or warranty cover are ever generated.
* **Security:** see `docs/SECURITY.md`.

## Solar model limitations
Only a planning-range sizing exists (`prelim-sizing-0.1.0`): monthly kWh × 12 × a 50 % or 80 % target ÷ an assumed 1,100–1,500
kWh/kWp/year gives a kWp *range*. The constants are developers' planning assumptions with **no validation evidence**.
It produces no generation figure, cost, savings, payback or battery size, ignores seasonality and shading, and every result is
labelled "PRELIMINARY — NOT A QUOTATION". A guard in code prevents an unvalidated estimator from emitting such figures.
Details: `docs/SOLAR_MODEL.md`. **Never present these numbers as an engineering design or an offer.**

## Monitoring and hardware
No device integration exists. `src/lib/integrations/` defines the read-only boundary; a reading that claims to be real
equipment data is refused unless a registered adapter exists (none does), and any simulated reading is stored flagged and
shown as **DEMO DATA — NOT LIVE EQUIPMENT DATA**. There is deliberately no command channel: no remote switching and no
grid-disconnection.

## Deployment constraints (summary — details in `docs/DEPLOYMENT.md`)
* Needs a **persistent local disk** and **exactly one app process**. Serverless platforms (Vercel, Netlify, Lambda) will lose all data.
* Back up the database **and** the uploads directory together, offsite and encrypted; rehearse the restore.
* Serve over HTTPS (the session cookie is `Secure` in production) and set `TRUSTED_PROXY_HOPS` correctly.
* Moving to PostgreSQL is designed as a reversible, staged plan but **not performed**; do it when a second instance,
  serverless hosting or point-in-time recovery is needed.

## Security limitations (summary — details in `docs/SECURITY.md`)
No password reset; no e-mail/SMS; no e-mail verification (anyone can register with any address); no second factor for staff;
in-memory rate limiting; no encryption at rest; no upload malware scanning; no CSP on HTML pages; no CI or dependency scanning;
no privacy policy or data-retention process; the supplier role has no portal and no end-to-end tests. This is a code review plus
tests, **not** an independent penetration test.

## Remaining work before real customers use it
1. **Account recovery and e-mail verification** (needs an e-mail/SMS provider — none is configured).
2. **Hosting**: a VPS/container with persistent volume, HTTPS proxy, scheduled **offsite encrypted backups of DB + uploads**, a
   rehearsed restore, monitoring/alerts. None of this exists in the repository.
3. **Staff hardening**: second factor, session idle timeout, failed-login audit trail.
4. **Legal/privacy**: privacy policy, consent record, retention and deletion procedure, review against Mongolian requirements.
5. **Real supplier data**: onboard real suppliers and enter dated quotations by hand; verify any supplier qualification with
   evidence before marking it verified. Nothing in the app invents prices, stock or partnerships.
6. **A validated solar-yield source** (measured data or a recognised model with documented validation) before any generation or
   savings figure is shown to customers.
7. **Version control and CI**: this directory is not a git repository; initialise one, run `lint`, `typecheck`, `test`, `e2e`
   and `npm audit` on every change.
8. Later: supplier/installer portal, English locale (UI strings only partly translated), Postgres port, real device adapters.
