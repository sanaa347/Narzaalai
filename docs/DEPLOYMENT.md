# Deployment, persistence and backup

Audience: whoever hosts this for the first real customers. Everything below was checked against the code in this repository;
anything not verified is marked **unverified**.

## 1. Can SQLite meet the initial hosting requirement?

**Yes, for a pilot: one server process, a small team of staff, tens to low hundreds of customers.** No, for serverless
hosting, multiple app instances, or anything needing point-in-time recovery or an uptime promise.

Why it is acceptable at this size: the database is one file opened in WAL mode with foreign keys on (`src/lib/db/index.ts`);
`better-sqlite3` is synchronous and fast; request volume from a few staff and a few hundred customers is tiny; reference
numbers are allocated in a transaction.

### Hard constraints

| Constraint | Consequence |
|---|---|
| **Needs a persistent local disk.** The DB file and the upload directory must survive restarts and redeploys. | Vercel/Netlify/Lambda-style hosting **will not work**: their filesystem is ephemeral, so accounts, projects and uploaded documents would vanish. |
| **One app process.** SQLite allows one writer at a time; WAL needs shared memory on a *local* filesystem. | Run exactly one instance. Do not put the DB on NFS/SMB/object-storage mounts. Do not scale horizontally. |
| **In-memory state.** Login lockout and the public-submission limiter live in process memory (`src/lib/auth/ratelimit.ts`). | They reset on every restart and are not shared between processes. Acceptable for one process; wrong for several. |
| **Uploads are plain files** under `NARZAALAI_UPLOAD_DIR`, referenced from the DB. | DB and uploads must be backed up *together*; restoring only one leaves dangling document records or orphan files. |
| **Synchronous driver.** A slow query blocks the Node event loop. | Fine at this scale. A very large report query would stall every request. None exists today. |
| **Write contention.** better-sqlite3 waits up to 5 s for a lock by default, then throws. | Not reachable with one process; becomes real the moment a second process (or an ad-hoc script) writes at length. |

### Concurrency facts

* Reads do not block writes and vice versa (WAL). Writes are serialized.
* Multi-step changes (submitting an assessment, changing status + writing the event, publishing a proposal) run inside one
  transaction, so a crash cannot leave a project in a new status without its history event.
* Two staff editing the same record: last write wins; there is no optimistic-locking/version column. Status changes are
  validated against the *current* status, which is read synchronously immediately before the write (no `await` in between), so
  in a single Node process a stale form cannot jump a project over a gate. That guarantee is a property of "one process";
  after a move to Postgres and several instances, re-read and check the status inside the transaction (`SELECT … FOR UPDATE`).

## 2. Persistence and backup

### What must be backed up

1. The SQLite file (`NARZAALAI_DB_PATH`).
2. The whole upload directory (`NARZAALAI_UPLOAD_DIR`).
3. Your environment configuration (stored somewhere safe, **not** in the repository).

### Taking a database backup (safe while the app is running)

```bash
NARZAALAI_DB_PATH=/srv/narzaalai/data/narzaalai.db \
NARZAALAI_BACKUP_DIR=/srv/narzaalai/backups KEEP=14 npm run backup
```

This uses SQLite's online backup API (not `cp`, which can miss data still in the `-wal` file), writes one self-contained file
`narzaalai-<UTC timestamp>.db`, then **opens the copy and runs `integrity_check` and `foreign_key_check`**; it fails loudly if
either is not clean. It never overwrites an existing backup and prunes only files matching its own name pattern.
Verified here: a backup of a 17-user / 14-project database reported `integrity_check=ok`, 0 foreign-key violations.

Schedule it (cron/systemd timer) at least daily, and copy **off the server** (another machine or object storage) together with
the uploads directory, e.g. `rsync -a --delete-after` or `rclone sync`. A backup on the same disk is not a backup.
Backups and uploads contain customer personal data and are **not encrypted by the application**: encrypt the destination.
Offsite copy and scheduling are **not implemented in this repository**; they are the operator's job.

### Restoring (rehearse this before you need it)

```bash
# 1. stop the app
# 2. keep the damaged state in case it is needed:  mv narzaalai.db narzaalai.db.broken ; rm -f narzaalai.db-wal narzaalai.db-shm
# 3. put the chosen backup in place
cp backups/narzaalai-20261029T044322Z.db /srv/narzaalai/data/narzaalai.db
# 4. restore the matching uploads directory from the same point in time
# 5. bring the schema up to date (no-op if already current) and start the app
NARZAALAI_DB_PATH=/srv/narzaalai/data/narzaalai.db npm run migrate && npm start
```

Verified here: a backup taken *before* migration 004 was restored to a new location, `npm run migrate` applied 004, the
integrity check was `ok`, there were 0 foreign-key violations, all rows were present, and the new guards were active.
Sessions are stored in the database, so users who were signed in at backup time stay signed in after a restore.

**Recovery point** = time of the last backup (up to 24 h of data with a daily backup). There is no continuous replication.

## 3. Environment

| Variable | Required | Notes |
|---|---|---|
| `NARZAALAI_DB_PATH` | yes in production | Absolute path on a local persistent disk |
| `NARZAALAI_UPLOAD_DIR` | yes in production | Absolute path, same disk class, backed up with the DB |
| `NARZAALAI_BACKUP_DIR`, `KEEP` | for `npm run backup` | |
| `TRUSTED_PROXY_HOPS` | default `1` | Number of reverse proxies you operate in front of the app (rate-limit key is the client IP counted from the right of `X-Forwarded-For`). Set `0` if the app is exposed directly. A wrong value either lets clients choose their own limiter key or merges everyone into one bucket. |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | first deploy only | Creates the first admin during `npm run migrate` if none exists; password ≥ 12 chars. Remove from the environment afterwards. |
| `SEED_PASSWORD` | dev/demo only | `npm run seed` refuses `NODE_ENV=production` |

Never commit real values. `.gitignore` ignores `.env`, `.env.*` (except `.env.example`), `data/` databases, uploads and backups.
No secret is read by browser code; the code uses no `NEXT_PUBLIC_` variables (the only mentions are commented-out placeholders in `.env.example`).

## 4. Recommended deployment for a small startup

**Phase A – pilot (now):** one small VPS or container host with a persistent volume.

```
Internet ── HTTPS reverse proxy (Caddy or nginx; automatic certificates; TRUSTED_PROXY_HOPS=1)
              └── next start  (ONE process, supervised by systemd/Docker restart policy)
                    ├── /srv/narzaalai/data/narzaalai.db      (local SSD, WAL)
                    └── /srv/narzaalai/data/uploads/
         cron: daily `npm run backup` + uploads copy ──► offsite encrypted storage
```

Checklist before the first real customer: HTTPS only; firewall allows only 80/443/SSH; app runs as an unprivileged user; disk
and offsite backup alerts; a *rehearsed* restore; `BOOTSTRAP_*` variables removed after the admin exists; seed data never loaded
(`npm run seed` is for development and demos and labels everything DEMO).

**Phase B – when you outgrow it** (second app instance, serverless hosting, need for point-in-time recovery, or a supplier
portal with many concurrent users): managed PostgreSQL + object storage for uploads, same Next.js application. Any managed
Postgres works; choose a provider/region after **measuring latency from Ulaanbaatar** (unverified here). Move the in-memory rate
limiter to the database or a shared store at the same time. Supabase is a reasonable choice because it bundles Postgres, auth
and storage, but this app has its own session/role model; adopting Supabase Auth and row-level security is an additional
decision, not a prerequisite.

## 5. Reversible migration plan: SQLite → PostgreSQL (designed, **not performed**)

Nothing here has been executed; no service is configured. The aim is that at no step is SQLite data destroyed.

What has to change (measured on this repo): 23 tables in `001_init.sql`; ~20 source files call `db.prepare(...)` synchronously;
SQLite-specific constructs: `strftime(...)` timestamp defaults (→ `now()` / `timestamptz`), `COLLATE NOCASE` on the unique
e-mail (→ `citext` or a lower-case unique index), `INTEGER` money (→ `bigint`, keep minor units), 11 triggers using
`RAISE(ABORT)` from migrations 003/004 (→ `CREATE FUNCTION … RAISE EXCEPTION` + triggers, or `CHECK` constraints), `INSERT … ON
CONFLICT` (compatible), `db.transaction` (→ `BEGIN/COMMIT` via the Postgres driver). The driver is synchronous today and
becomes async: every service function and its callers (server actions, pages) gain `await`.

Steps:

1. **Freeze the contract.** Run `npm test` and `npm run e2e` green on SQLite; they are the acceptance suite for the port.
2. **Introduce a data-access seam** (repository functions per service) while still on SQLite. Behaviour-neutral, reversible by revert.
3. **Write `db/postgres/001…004`** translating the schema, including the guards. Apply to an empty Postgres in a scratch environment.
4. **Port services one domain at a time** behind the seam (quotes first: most integrity rules), running the same vitest suite
   against both back-ends in CI.
5. **Write a one-way copy script** (SQLite → Postgres) that reads a *backup* file, never the live DB. It must verify row counts
   per table, re-run `computeQuoteTotals` over every quotation and compare to stored totals, and re-check all foreign keys.
6. **Rehearse**: restore the latest backup, run the copy, run `npm run e2e` against Postgres.
7. **Cutover** during a quiet window: stop the app, `npm run backup`, copy uploads to object storage, run the copy script, verify,
   start the app on Postgres. **Keep the SQLite file and the pre-cutover backup untouched.**
8. **Rollback** at any point before new writes matter: stop the app, point `DATABASE` back at the SQLite file, start. After new
   writes have been made on Postgres, rollback means exporting those rows back; decide the freeze period for that in advance.

Do not start step 3 until there is a real reason (see Phase B). A premature port costs weeks and adds an unconfigured service.

## 6. Running behind a platform that terminates TLS

The session cookie is `Secure` in production, so the site must be served over HTTPS. Server-action requests are CSRF-checked by
comparing `Origin` with the forwarded host (E2E-tested: a forged `Origin: evil.example` request is aborted), so the proxy must
forward `Host`/`X-Forwarded-Host` correctly.
