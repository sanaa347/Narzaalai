# Security review and limitations

Scope: this repository at the time of the production-readiness sprint (2026-10-29). Method: read every entry point that can
read or change data, then confirm with automated tests (`npm test`: 189 unit/service tests; `npm run e2e`: 98 browser/HTTP
tests including forged requests). **This is a code review plus tests by the developers' tooling, not an independent
penetration test.** Do not describe the system as "security certified".

## 1. Principle: authorization lives on the server, not in the UI

A hidden button is not access control. Each layer below enforces independently, so removing one does not open the door:

| Layer | What it enforces | Where |
|---|---|---|
| Page guard | Every `/ops/**` page calls `requireStaff()` itself; every `/dashboard/**` page calls `requireCustomer()`. They do **not** rely on the layout (layouts are not a reliable boundary in the Next.js App Router). All 19 pages were checked individually. | `src/lib/auth/current.ts`, each `page.tsx` |
| Server-action guard | All 33 state-changing actions go through `runAction(form, "staff" \| "admin" \| "customer", …)`: session cookie → active user → role. Only login, logout and public assessment submission are open, by design. | `src/lib/actions/run.ts` |
| Service guard | Services re-check the actor and ownership (`requireStaffActor`, `canViewOrgData`, `canApproveAsCustomer`) so a bug in an action or a future caller cannot bypass them. | `src/lib/services/*`, `src/lib/auth/permissions.ts` |
| Download route | `/api/documents/[id]`: authenticate → look up document → `canViewDocument` (staff all; customer only `customer_visible` in their own organization) → only then touch the disk. A missing, hidden or forbidden document gives the same 404. File name is a server-generated UUID; path is `basename`d into the upload directory. | `src/app/api/documents/[id]/route.ts`, `services/documents.ts` |
| Database | Foreign keys on; `CHECK`s and triggers on money, currency, and "a supplier quotation needs a received date and source note" (migrations 003, 004). | `db/migrations/` |

Roles are read from the database row for the session's user, never from client input. A disabled user stops working
immediately (the user row is re-read on every request). A role with no portal (`supplier`; there is no supplier UI) is refused
at login and gets 404 on customer pages instead of redirect-looping.

## 2. Verified by test (not just by reading)

* Anonymous visitors are redirected from every `/ops/**` and `/dashboard` route and get **404** (not 403/redirect, so existence
  is not revealed) for any document id, including with a made-up session cookie.
* Customer A cannot open Customer B's project, any of B's documents, answer B's information request, attach a file to B's
  project by forging the hidden project id, or change a document's visibility/status.
* A customer cannot reach `/ops/**`, and cannot supply "evidence" documents: evidence types are refused server-side.
* **Replayed server actions**: a staff action replayed with no cookie, with a customer cookie, or with a no-portal-role cookie
  creates nothing; with a valid staff cookie but a cross-site `Origin`, Next.js aborts it (CSRF). A control request with a
  valid staff cookie *does* succeed, so the refusals are meaningful.
* Forged approvals (expired, indicative, no-date, or not-in-proposal quotation ids) and forged status targets are refused and
  change nothing. Completion without commissioning evidence is refused.
* Login: identical error for wrong password and unknown e-mail; repeated failures lock the account (per e-mail and per
  client IP) even for the correct password; `?next=` cannot move a customer out of `/dashboard` or staff out of `/ops`; logout
  invalidates the token server-side.
* Session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production, not readable by page script, token never in page HTML.
* Headers on all responses: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
  Downloads additionally get `Content-Security-Policy: sandbox; default-src 'none'`, `nosniff`, `Cache-Control: private, no-store`.
* Uploads: extension allowlist, magic-byte check (an HTML page renamed `.pdf` is refused), 10 MB cap, executables/HTML/SVG
  refused, per-project cap on customer uploads, original name sanitized.
* Passwords: scrypt; session tokens stored only as hashes; no secrets, tokens or passwords echoed back into forms.

## 3. Defect found and fixed in this review

**Money could be made inconsistent by writing SQL directly.** The service layer computed totals correctly, but the database
accepted: changing a quotation's currency while its lines stayed in the old one; changing one line's currency; setting a line
total to something other than quantity × unit price; setting a quotation total that is not the sum of its parts. Migration
`004_money_consistency_guards.sql` adds six triggers (reversible: see the file header); `updateQuote` now deletes old lines
before changing currency so legitimate edits still work. Six tests in `tests/quote-integrity.test.ts` try each bypass.
Existing rows are not re-validated; the triggers act on future writes.

## 4. Known limitations — read before real customers use this

Ordered by how likely they are to hurt a real deployment.

1. **No password reset and no e-mail verification.** There is no e-mail/SMS sending at all. A customer who forgets their
   password cannot recover the account (an admin would have to intervene in the database). Because addresses are not
   verified, anyone can register an assessment with someone else's address and choose its password; the real owner is then told
   the address "already has an account". The sign-up message also confirms that an address is registered (account
   enumeration), a deliberate trade-off against usability that should be revisited once e-mail verification exists.
   *Needs an e-mail/SMS provider; not done because none is configured.*
2. **Staff accounts have no second factor.** A single leaked or guessed staff password exposes all customer data.
   Staff passwords must be ≥ 12 characters (customers ≥ 8), enforced server-side; there is no breach-list check and no forced rotation.
3. **Rate limits are in memory, per process** and reset on restart (see DEPLOYMENT.md §1). The per-e-mail lockout also lets
   an attacker deliberately lock a known customer out for 15 minutes. Behind a proxy, `TRUSTED_PROXY_HOPS` must match reality.
4. **No encryption of personal data at rest** (database, uploads, backups). Protect the disk and the backup destination.
   Customer data includes names, phone numbers, e-mail, addresses and utility bills.
5. **No malware scanning of uploads.** Files are never executed or rendered as HTML by the app (sandboxed, `nosniff`,
   documents `.docx`/`.xlsx`/`.csv` are served as attachments), but staff who open them locally are exposed to whatever
   the file contains.
6. **Sessions last 14 days with no idle timeout, no "sign out everywhere" and no rotation on privilege change.**
7. **No Content-Security-Policy on HTML pages** (only on downloads). The app has no known XSS sink (React escapes output; no
   `dangerouslySetInnerHTML` use was found in the pages reviewed), but a CSP would limit the damage of one introduced later.
8. **No audit log of failed logins or of data *reads* by staff.** Business changes (status, notes, quotes) are recorded with
   the actor; who looked at a customer's record is not.
9. **No automated dependency/vulnerability scanning in CI** and no CI at all. Run `npm audit` before deployment.
10. **Supplier role has no portal.** The permission model has rules for it (a supplier sees only its own quotes/documents) and
    they are unit-tested, but no UI exercises them, so they have not been tested end-to-end. Do not enable supplier logins
    until a portal and E2E tests exist.
11. **Privacy/legal:** consent text exists in the wizard, but there is no privacy policy, retention schedule or deletion/export
    procedure. Mongolian personal-data requirements were **not** reviewed.

## 5. Secrets

No secrets are committed; `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), databases, uploads and backups.
The browser bundle reads no environment variables. The first admin is created from `BOOTSTRAP_ADMIN_*` at migrate time and
those variables should be removed afterwards. Demo accounts exist only after `npm run seed`, which refuses production mode.
Logs: the application writes no request bodies, passwords or tokens; Next.js's production error pages hide server error text.
