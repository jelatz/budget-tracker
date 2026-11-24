# Security Audit Report: budget-tracker (Full Monorepo)

- **Date**: 2026-11-24
- **Scope**: `full-repo` (`apps/api`, `apps/mobile`, `packages/contracts`, `scripts/`, Docker/Vercel/Railway configs)
- **Mode**: `Audit + Remediation (All 12 HIGH Blockers Fixed)`
- **Stack**: Expo SDK 58 (iOS / Android / Web) + Hono (`@repo/api`) + PostgreSQL / Drizzle ORM + Zod (`@repo/contracts`) + TanStack Query + Vercel Build Output v3 / Railway Docker
- **Preflight**: `security-preflight.py` (221 files, 100 git commits: 0 sensitive tracked files, 0 working-tree/git-history secrets, 0 `EXPO_PUBLIC_` secret leaks, 2 `execSync` build-script hits, 4 `Math.random()` client-ID hits) + `pnpm audit` (`0 critical`, `0 high`, `5 moderate`, `1 low`)
- **Release Verdict**: **`CONDITIONAL_PASS`** (`0` Critical, `0` High open [`12` High `FIXED`], `10` Medium `OPEN`, `3` Low `OPEN`)

---

## 12-Domain Coverage Matrix

| # | Domain | Status | Surfaces Checked / Justification |
|---|---|---|---|
| 1 | Authentication, Session & Identity | `FINDINGS` | `apps/api/src/core/auth/*`, `apps/api/src/capabilities/auth/*`, `packages/contracts/src/auth.schema.ts`, `apps/mobile/src/features/auth/*` |
| 2 | Authorization, RBAC/ABAC & Multi-Tenancy | `FINDINGS` | All API routes/handlers/repositories (`userId` scoping), Drizzle schema/migrations, `state-reducer.ts`, confirmation gates |
| 3 | Injection, Parsing & Deserialization | `FINDINGS` | Drizzle queries, `portability.schema.ts` CSV/JSON import-export, `expenses.ts` / `calculator.ts` lookups, `build-vercel.mjs` |
| 4 | Business Logic, Financial & Concurrency | `FINDINGS` | `sync/*`, `transactions/*`, `accounts/*`, `reconcile/*`, `state-reducer.ts`, `money.ts`, `calculator.ts` |
| 5 | Cryptography, Secrets & Key Hygiene | `FINDINGS` | `security-preflight.py` (221 files + 100 commits), `core/auth/crypto.ts`, `.env*`, `EXPO_PUBLIC_*`, client ID generators |
| 6 | APIs, Webhooks, SSRF & Network | `FINDINGS` | `apps/api/src/app.ts`, `health/routes.ts`, `vercel.ts`, `api-client.ts`, `receiptUri` (no inbound webhooks in repo) |
| 7 | Browser & Web Client Security | `FINDINGS` | `vercel.json`, `build-vercel.mjs`, `token-storage.web.ts`, `legacy-web-migration.web.ts`, `external-link.tsx`, `use-web-auto-reload.web.ts` |
| 8 | Mobile Client Security (`M1–M10`) | `FINDINGS` | `apps/mobile/app.json`, `token-storage.ts`, `auth-context.tsx`, `api-client.ts`, `apps/mobile/src/app/*`, `route-error-boundary*.tsx` |
| 9 | File Uploads & Object Storage | `FINDINGS` | `file-portability*.ts`, `portability-screen.tsx`, `transactions.schema.ts` (`receiptUri`), `metadata-pill-bar.tsx` (no server upload/S3 presign endpoints in repo) |
| 10 | AI, LLM & Agentic Security | `N/A — no AI/LLM calls, prompts, RAG/vectors, or agentic tools exist in repository` | Verified across `apps/api`, `apps/mobile`, `packages/contracts` |
| 11 | Error Handling, Logging & Privacy | `FINDINGS` | `apps/api/src/core/errors.ts`, `logger.ts`, `transactions/repository.ts`, `route-error-boundary*.tsx`, `login-form.tsx`, `register-form.tsx` |
| 12 | Supply Chain, Dependencies & CI/CD | `FINDINGS` | `pnpm audit`, `.dockerignore`, `apps/api/Dockerfile`, `apps/api/build.mjs`, `railway.json`, `scripts/build-vercel.mjs` *(Prod cloud IAM/WAF/DB TLS/backups outside repo: `UNVERIFIED — external runtime infra`)* |

---

## Findings (Ordered `CRITICAL` -> `HIGH` -> `MEDIUM` -> `LOW` -> `INFO`)

### [F-01] [HIGH] Missing Rate Limiting Across Auth & DB-Health Endpoints + Weak 6-Char Password Minimum
- **Domain**: 1, 6 | **Classification**: `CWE-307 / CWE-521 / CWE-770` (`OWASP A07:2025 / API4:2023`)
- **Location**: `apps/api/src/capabilities/auth/routes.ts:20-39`, `apps/api/src/capabilities/health/routes.ts:9-16`, `packages/contracts/src/auth.schema.ts:17,27`
- **Exploit Scenario / PoC**: `RATE_LIMITED` (`429`) is defined in `core/errors.ts:15` but never invoked. Attackers can run unrestricted credential-stuffing loops against `POST /v1/auth/login`, hammer CPU/memory-intensive `scrypt` hashing on `/v1/auth/login` and `/v1/auth/register`, or flood unauthenticated `GET /health?check=db` (`SELECT 1`) to exhaust `DB_POOL_MAX` (`2–5`). Meanwhile `registerInputSchema` and `loginInputSchema` accept 6-character passwords.
- **Impact / Blast Radius**: Account takeover via brute-force/stuffing and unauthenticated API/DB connection pool exhaustion.
- **Required Fix Contract**: Add per-IP and per-email rate-limiting middleware on `/v1/auth/*` (and per-IP rate limiting/caching on `/health?check=db` + `/v1/*`) returning `AppError('RATE_LIMITED', ...)` (`429`), and raise minimum password length to `>= 8` (recommended `12`) in `packages/contracts/src/auth.schema.ts`.
- **Status**: `FIXED` *(Added `core/rate-limit.ts` on `/v1/auth/*`, `/v1/*`, and `/health?check=db`; raised `registerInputSchema.password` and `RegisterForm` minimum to 8 chars)*

### [F-02] [HIGH] Unbounded HTTP Request Bodies & Contract Arrays Enable OOM / DB Write-Amplification DoS
- **Domain**: 6 | **Classification**: `CWE-400 / CWE-770` (`OWASP API4:2023`)
- **Location**: `apps/api/src/app.ts:149-204`, `apps/api/package.json:9`, `packages/contracts/src/portability.schema.ts:22-35`, `packages/contracts/src/auth.schema.ts:19`, `packages/contracts/src/sync.schema.ts:66,180`, `packages/contracts/src/transactions.schema.ts:99,101,220-221`
- **Exploit Scenario / PoC**: `createApp` mounts no HTTP body-size cap while `@repo/api` runs under `--max-old-space-size=96` (and `Dockerfile:30`). `backupEnvelopeSchema` has no `.max()` bounds on any array (`accounts`, `categories`, `transactions`, `categoryBudgets`, `recurringCommitments`, `sinkingFunds`, `quickPresets`), `syncPushRequestSchema` allows up to `500` mutations each carrying `transaction.createBatch` (`500` txs -> `250,000` records) or `500` `backup.import` payloads, and `splits`/`tags`/`recentMerchants`/`knownTags` are unbounded. Crucially, unauthenticated `POST /v1/auth/register` accepts `initialBackup: backupEnvelopeSchema.optional()`, enabling anonymous 96 MB heap OOM or massive DB writes.
- **Impact / Blast Radius**: Unauthenticated single-request API crash (DoS) and Postgres transaction bloat.
- **Required Fix Contract**: Mount `hono/body-limit` (e.g., `64 KiB` default, `1 MiB` for `/v1/sync` and `/v1/auth/register`), add explicit `.max()` caps on all arrays/strings in `portability.schema.ts`, `sync.schema.ts`, and `transactions.schema.ts`, and cap total records processed per `/v1/sync` request.
- **Status**: `FIXED` *(Added `hono/body-limit` (`1 MiB` on `/v1/sync` and `/v1/auth/register`, `64 KiB` on standard `/v1/*` routes) + `.max()` caps across `backupEnvelopeSchema`, `syncPushRequestSchema`, `splits`, `tags`, and `smartDefaults`)*

### [F-03] [HIGH] Destructive Confirmation Gate Bypassed via `POST /v1/sync` & Deterministic Token Leaked in Error Messages
- **Domain**: 2, 4 | **Classification**: `CWE-287 / CWE-840` (`OWASP API1/API5/A06:2025`)
- **Location**: `packages/contracts/src/sync.schema.ts:48-52,79-82,163-174`, `packages/contracts/src/state-reducer.ts:300-344,462-470,811-906`, `apps/api/src/capabilities/accounts/handler.ts:88-92`, `apps/api/src/capabilities/transactions/handler.ts:114-118`, `apps/api/src/capabilities/reconcile/handler.ts:59-66`
- **Exploit Scenario / PoC**: `syncMutationSchema` marks `confirmation` as `.optional()` on `account.delete`, `transactions.clearAll`, `state.resetDemo`, and `backup.import` (and omits it on `reconciliation.apply`), and `applySyncMutation` never calls `verifyConfirmationToken`. Any authenticated caller or script can wipe all transactions, delete accounts, or overwrite backups via `POST /v1/sync` without confirmation. Furthermore, REST error responses leak the exact deterministic `confirmationToken` (`action:targetId`) in the message string.
- **Impact / Blast Radius**: Irreversible financial ledger deletion/overwrite bypassing the confirmation gate.
- **Required Fix Contract**: Require and validate `confirmation` inside `applySyncMutation` / `POST /v1/sync` for destructive mutations, remove the expected token from error messages, and use short-lived server-signed challenge tokens bound to `{ userId, action, targetId }` for high-consequence actions.
- **Status**: `FIXED` *(Enforced `verifyConfirmationToken` in `handleSyncPush` for all destructive sync mutations including `reconciliation.apply`, and scrubbed literal tokens from REST/sync error messages)*

### [F-04] [HIGH] Stale-Revision Silent Overwrite in `POST /v1/sync` (`lastKnownRevision` Discarded)
- **Domain**: 4 | **Classification**: `CWE-362 / CWE-840` (`OWASP A06:2025`)
- **Location**: `apps/api/src/capabilities/sync/handler.ts:44-59`, `apps/api/src/capabilities/sync/repository.ts:532-618`, `packages/contracts/src/state-reducer.ts:275-281`
- **Exploit Scenario / PoC**: `handleSyncPush` discards `body.lastKnownRevision` completely, and `pushMutations` applies non-commutative state-replacing mutations (`account.upsert` accepting arbitrary client `balanceMinor`, `backup.import` `overwrite`, `transactions.clearAll`, `state.resetDemo`, `transaction.update`) regardless of current `users.stateRevision` (and REST writes bump `stateRevision` without logging `sync_operations`). A stale client pushing with an old `lastKnownRevision` silently clobbers newer server balances and transactions.
- **Impact / Blast Radius**: Silent financial data loss and multi-device balance corruption.
- **Required Fix Contract**: Pass `lastKnownRevision` to `pushMutations`, verify `userRow.stateRevision === lastKnownRevision` inside the `FOR UPDATE` transaction for non-commutative/destructive mutations (returning `409 CONFLICT` when stale), and forbid direct `balanceMinor` overwrites on existing accounts via `account.upsert`.
- **Status**: `FIXED` *(Added `lastKnownRevision` conflict checks (`409 CONFLICT`) in `pushMutations`, automatic pull-and-retry on `409` in `sync-engine.ts`, and `balanceMinor` preservation for existing accounts in `account.upsert`)*

### [F-05] [HIGH] Cross-Currency 1:1 Balance Corruption & Orphaned Account References
- **Domain**: 4 | **Classification**: `CWE-840 / CWE-682` (`OWASP A06:2025`)
- **Location**: `apps/api/src/capabilities/transactions/repository.ts:253-294,334-428`, `packages/contracts/src/state-reducer.ts:87-123,537-569,685-715`
- **Exploit Scenario / PoC**: Neither REST transaction persistence nor `state-reducer.ts` checks `tx.currency === account.currency` (or `toAccount.currency` on `TRANSFER`), applying 1:1 minor-unit arithmetic across different currencies (e.g., deducting `100` USD cents from a PHP account). In `state-reducer.ts:540,558`, `commitment.pay` with an override `accountId` overwrites `tx.currency` to `targetAccount.currency` while reusing `commitment.amountMinor` unconverted, and `transaction.create`/`sinkingFund.contribute` persist transactions pointing to non-existent accounts.
- **Impact / Blast Radius**: Silent ledger and account balance corruption across multi-currency or deleted-account states.
- **Required Fix Contract**: Enforce matching currency across transactions, commitments, and source/destination accounts in both `transactions/repository.ts` and `state-reducer.ts`, and reject sync mutations referencing missing `accountId`/`toAccountId` instead of creating orphaned rows.
- **Status**: `FIXED` *(Added currency-match & account-existence enforcement in both `transactions/repository.ts` and `state-reducer.ts`)*

### [F-06] [HIGH] `POST /v1/transactions/clear` Permanently Corrupts Account Balances & Reconciliations
- **Domain**: 4 | **Classification**: `CWE-840 / CWE-662` (`OWASP A06:2025`)
- **Location**: `apps/api/src/capabilities/transactions/repository.ts:510-535`
- **Exploit Scenario / PoC**: `clearAllTransactions` deletes all `transactions` (cascading `transaction_splits`) and increments `users.stateRevision`, but never resets `accounts.balanceMinor = 0`, never resets `categories.usageCount = 0`, and never deletes `balance_reconciliations` (unlike `state-reducer.ts:462-470`). Every subsequent `/v1/sync` pull and reconciliation computes against stale non-zero balances with zero underlying transactions.
- **Impact / Blast Radius**: Permanent divergence between account balances and transaction ledger.
- **Required Fix Contract**: Inside the `clearAllTransactions` DB transaction, atomically set `accounts.balanceMinor = 0`, `categories.usageCount = 0`, and delete `balanceReconciliations` scoped by `userId`.
- **Status**: `FIXED` *(Updated `clearAllTransactions` in `transactions/repository.ts` to reset `accounts.balanceMinor = 0`, `categories.usageCount = 0`, and clear `balanceReconciliations`)*

### [F-07] [HIGH] Split Transactions Crash `PATCH` & `DELETE /v1/transactions/:id` with `500 INTERNAL_ERROR`
- **Domain**: 11 | **Classification**: `CWE-755 / CWE-20` (`OWASP A10:2025`)
- **Location**: `apps/api/src/capabilities/transactions/repository.ts:333,466`
- **Exploit Scenario / PoC**: Both `updateTransaction` and `deleteTransactionById` query `transactions` without querying `transactionSplits` and pass `[]` into `mapTransactionRow(existingRow, [])`, which executes `transactionSchema.parse(...)`. Any split transaction (`categoryId = null` with `>= 2` splits in `transaction_splits`) fails `refineTransactionRules` (`"Category is required"`), throwing an unhandled `ZodError` (`500`).
- **Impact / Blast Radius**: Complete inability to edit or delete any split transaction via REST API (`500 INTERNAL_ERROR`).
- **Required Fix Contract**: Load `transactionSplits` scoped by `(userId, transactionId)` inside the DB transaction before calling `mapTransactionRow` (or compute balance reversal deltas directly from `existingRow`).
- **Status**: `FIXED` *(Loaded `transactionSplits` inside `updateTransaction` and `deleteTransactionById` before `mapTransactionRow`)*

### [F-08] [HIGH] 30-Day Bearer Session Token Stored in Browser `localStorage` (Web)
- **Domain**: 1, 7 | **Classification**: `CWE-922` (`OWASP A07:2025 / ASVS V14`)
- **Location**: `apps/mobile/src/common/lib/token-storage.web.ts:3-81`, `apps/api/src/capabilities/auth/routes.ts:20-29`, `apps/api/src/capabilities/auth/handler.ts:19`
- **Exploit Scenario / PoC**: Web clients store 30-day session bearer tokens (`AUTH_TOKEN_KEY`) and user metadata in `globalThis.localStorage`. Any XSS vulnerability, malicious dependency, or compromised browser extension on the origin can read `localStorage` directly and hijack the session for up to 30 days.
- **Impact / Blast Radius**: Full account takeover across web sessions.
- **Required Fix Contract**: Issue web session tokens via `HttpOnly; Secure; SameSite=Lax` (or `__Host-`) cookies paired with CSRF protection in `apps/api`, keeping only non-sensitive UI state in memory/React Query.
- **Status**: `FIXED` *(Added `HttpOnly; SameSite=Lax` `bt_session` cookie issuance/clearing + `X-Requested-With` CSRF guard on cookie-auth writes in `apps/api`, removed web `localStorage` token storage in `token-storage.web.ts`, and enabled `credentials: 'include'` in `api-client.ts`)*

### [F-09] [HIGH] Native `SecureStore` Missing `WHEN_UNLOCKED_THIS_DEVICE_ONLY` & Android `allowBackup: false`
- **Domain**: 8 | **Classification**: `CWE-922 / CWE-312` (`OWASP M9`)
- **Location**: `apps/mobile/src/common/lib/token-storage.ts:24-59`, `apps/mobile/app.json:16-24`
- **Exploit Scenario / PoC**: `SecureStore.setItemAsync` omits `{ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }`, allowing iOS Keychain tokens to migrate via iCloud/iTunes backups onto other hardware. `apps/mobile/app.json` also omits `android.allowBackup: false`, risking Android Auto Backup inclusion of app data/SQLite state.
- **Impact / Blast Radius**: Extraction or unintended cross-device migration of 30-day auth tokens and local financial state from device backups.
- **Required Fix Contract**: Pass `{ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }` to all `SecureStore.setItemAsync` calls and set `android.allowBackup: false` (via `app.json`/config plugin).
- **Status**: `FIXED` *(Set `SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY` in `token-storage.ts`, enabled `configureAndroidBackup: true`, and added `apps/mobile/plugins/with-android-no-backup.js` setting `android:allowBackup="false"`)*

### [F-10] [HIGH] Auth Lifecycle Cache-Wipe Bypass & `signIn` 401 Zombie-Session Race
- **Domain**: 1, 8 | **Classification**: `CWE-613 / CWE-212` (`OWASP A07:2025 / M9`)
- **Location**: `apps/mobile/src/features/auth/context/auth-context.tsx:151-247`
- **Exploit Scenario / PoC**: (1) On startup `401` (`lines 151-157`), `clearSyncCacheForUser` is never called. (2) In `logout()` (`line 241`), `if (currentUserId && pendingCount === 0)` skips `clearSyncCacheForUser(currentUserId)` whenever `pendingCount > 0` (including automatic `401` logout), leaving the entire cached ledger (`budget_tracker_v4_cloud:${userId}`) in `localStorage` or unencrypted SQLite `kv-store`. (3) In `signIn()` (`lines 177-180`), `setActiveSyncUser` and `await syncNow()` run before `setUser(session.user)`; if `syncNow()` hits `401` -> `logout()`, `logout()` observes `user === null`, skips cache wipe, clears the token, and `signIn()` then calls `setUser(session.user)`, leaving an unauthenticated zombie session.
- **Impact / Blast Radius**: Persistent financial data exposure on shared devices after logout/revocation and broken auth state transitions.
- **Required Fix Contract**: Always call `clearSyncCacheForUser` on `401` revocation and explicit logout (falling back to `getActiveSyncUserId()`, with user warning before wiping dirty offline edits on manual logout), and abort `signIn()` if `syncNow()` fails with `401`.
- **Status**: `FIXED` *(Updated `auth-context.tsx` to clear user sync cache unconditionally on `401` and `logout()` via `getActiveSyncUserId()` and abort `signIn`/`signUp`/`signInDemo` if `syncNow()` invalidates the session)*

### [F-11] [HIGH] Missing HTTP Security Headers (`CSP`, `HSTS`, `nosniff`, `X-Frame-Options`) & `Cache-Control: private, no-store`
- **Domain**: 6, 7 | **Classification**: `CWE-693 / CWE-1021 / CWE-525` (`OWASP A02/A05:2025`)
- **Location**: `vercel.json:1-6`, `scripts/build-vercel.mjs:145-170`, `apps/api/src/app.ts:149-204`
- **Exploit Scenario / PoC**: Neither the Vercel static routing config nor `apps/api` sets `Content-Security-Policy` (including `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, or `Referrer-Policy`. Furthermore, authenticated `/v1/*` API responses lack `Cache-Control: private, no-store`, risking intermediate proxy/CDN/browser disk caching of financial payloads.
- **Impact / Blast Radius**: Lack of clickjacking and XSS defense-in-depth (compounding `localStorage` token risk in F-08) and potential caching of sensitive financial JSON.
- **Required Fix Contract**: Emit baseline security headers across all web and API routes in `scripts/build-vercel.mjs` / `vercel.json` and add middleware in `apps/api/src/app.ts` setting `Cache-Control: private, no-store` plus security headers on `/v1/*`.
- **Status**: `FIXED` *(Added strict CSP with SHA-256 inline-script hashes + security headers in `scripts/build-vercel.mjs`, and `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`, and `Cache-Control: private, no-store` in `apps/api/src/app.ts`)*

### [F-12] [HIGH] Root-Anchored `.dockerignore` Allows `apps/api/.env` & Artifacts into Docker Build Context
- **Domain**: 5, 12 | **Classification**: `CWE-538 / CWE-200` (`OWASP A02:2025`)
- **Location**: `.dockerignore:1,8,10-13`, `apps/api/Dockerfile:18,21,32`
- **Exploit Scenario / PoC**: `.dockerignore` specifies root-anchored patterns (`node_modules`, `dist`, `*.log`, `.env`, `.env.*`) rather than `**/`-prefixed patterns. Under Docker `filepath.Match` rules, `COPY apps/api ./apps/api` still includes `apps/api/.env` (and `apps/api/node_modules`/`dist`) if present locally, and `pnpm deploy --prod` can copy `apps/api/.env` into `/prod/api` inside the final image.
- **Impact / Blast Radius**: Production DB credentials or secrets baked directly into Railway/Docker image layers.
- **Required Fix Contract**: Prefix recursive ignores in `.dockerignore` (`**/node_modules`, `**/dist`, `**/*.log`, `**/.env`, `**/.env.*`, `!**/.env.example`) and explicitly strip `.env*` / test files from `/prod/api` in `Dockerfile`.
- **Status**: `FIXED` *(Updated `.dockerignore` with recursive `**/` patterns and added `rm -f /prod/api/.env /prod/api/.env.*` in `apps/api/Dockerfile`)*

### [F-13] [MEDIUM] CSV Formula Injection in `escapeCsvField` / `serializeTransactionsToCsv`
- **Domain**: 3 | **Classification**: `CWE-1236` (`OWASP A05:2025`)
- **Location**: `packages/contracts/src/portability.schema.ts:231-303`, `apps/mobile/src/features/portability/screens/portability-screen.tsx:129`
- **Exploit Scenario / PoC**: `escapeCsvField` only quotes `,`, `"`, `\n`, `\r` and leaves leading `=`, `+`, `-`, `@`, `\t`, `\r` unneutralized in `accountName`, `toAccountName`, `categoryName`, `merchant`, `note`, and `tags`. Exporting transactions sourced from an untrusted backup/CSV allows arbitrary formula execution when opened in Excel/Google Sheets/LibreOffice.
- **Impact / Blast Radius**: Client-side spreadsheet formula/command execution or data exfiltration when exporting CSVs.
- **Required Fix Contract**: Prefix text values matching `/^\s*[=+\-@\t\r]/` with `'` inside `escapeCsvField` before RFC 4180 quoting (keeping numeric `Amount` cells unprefixed).
- **Status**: `OPEN`

### [F-14] [MEDIUM] Unbounded Client File Import (`pickTextFile` / `PortabilityScreen`)
- **Domain**: 9 | **Classification**: `CWE-400` (`OWASP A06:2025`)
- **Location**: `apps/mobile/src/common/lib/file-portability.web.ts:33-64`, `apps/mobile/src/features/portability/screens/portability-screen.tsx:157-160,211`
- **Exploit Scenario / PoC**: `pickTextFile` reads arbitrarily large files into memory via `readAsText` with zero `file.size` cap (and leaks the pending Promise on dialog cancel). `PortabilityScreen` passes parsed payloads straight to sync without chunking CSV imports (`>500` rows fail `syncMutationSchema` `max(500)`) or limiting file size.
- **Impact / Blast Radius**: Client tab OOM crash or broken partial CSV imports.
- **Required Fix Contract**: Enforce a `file.size` limit (e.g., 5–10 MB) in `pickTextFile` and `PortabilityScreen`, resolve `null` on cancel, and chunk CSV transaction imports to `<= 500` items per batch.
- **Status**: `OPEN`

### [F-15] [MEDIUM] Unvalidated `receiptUri` Scheme & Length (Tracking Beacon / Arbitrary URI Storage)
- **Domain**: 6, 9 | **Classification**: `CWE-20 / CWE-918` (`OWASP A05:2025`)
- **Location**: `packages/contracts/src/transactions.schema.ts:103`, `apps/mobile/src/features/transactions/components/metadata-pill-bar.tsx:739-743`
- **Exploit Scenario / PoC**: `receiptUri` accepts any non-empty string with no scheme allowlist or `.max()` length bound. Untrusted sync or JSON backup payloads can store `javascript:`, `data:text/html`, arbitrary remote `http://`/`https://` tracking URLs (auto-fetched by `<Image source={{ uri: value.receiptUri }} />`), or multi-megabyte strings.
- **Impact / Blast Radius**: Client IP/beacon leakage, memory bloat, or unsafe URI persistence.
- **Required Fix Contract**: Add `.max(512)` and restrict `receiptUri` to safe explicit schemes (`file://`, `content://`, `ph://`, `local://`, or size-bounded `data:image/(png|jpeg|webp);base64,`).
- **Status**: `OPEN`

### [F-16] [MEDIUM] Reconciliation Extreme-Delta Clamping/500 Crash, Duplicate `adjustmentTransactionId` & Missing Safe-Integer Caps
- **Domain**: 4 | **Classification**: `CWE-190 / CWE-682` (`OWASP A06:2025`)
- **Location**: `apps/api/src/capabilities/reconcile/repository.ts:189-245`, `packages/contracts/src/state-reducer.ts:745-809`, `packages/contracts/src/money.ts:93-128`, `packages/contracts/src/calculator.ts:195-275`, `packages/contracts/src/category-budget.schema.ts:13`, `packages/contracts/src/sinking-funds.schema.ts:10,15`, `packages/contracts/src/recurring.schema.ts:108-109,157`
- **Exploit Scenario / PoC**: Reconciling between valid extremes (`-8e14` to `+8e14`) yields `discrepancyMinor = 1.6e15 > MAX_SAFE_MONEY_MINOR (1e15)`: `reconcile/repository.ts:189` silently clamps `adjustmentTransaction.amountMinor` to `1e15` (dropping `6e14` minor units) and crashes at `line 237` with `ZodError` (`500`). In `state-reducer.ts:765-802`, a colliding `adjustmentTransactionId` links an unrelated transaction. `parseDecimalToMinorUnits`, `evaluateCalculatorExpression`, and budget/sinking-fund/installment schemas also lack `Number.isSafeInteger` / `MAX_SAFE_MONEY_MINOR` upper bounds.
- **Impact / Blast Radius**: Ledger inaccuracy, silent clamping, or `500` crash on extreme inputs.
- **Required Fix Contract**: Reject reconciliations where `Math.abs(actualBalanceMinor - appBalanceMinor) > MAX_SAFE_MONEY_MINOR` with `400 VALIDATION_ERROR`, reject colliding `adjustmentTransactionId`s, enforce `Number.isSafeInteger` & `<= MAX_SAFE_MONEY_MINOR` in `money.ts`/`calculator.ts`, and bound integer schemas.
- **Status**: `OPEN`

### [F-17] [MEDIUM] Duplicate `splits[].id` Causes Unhandled `500` in REST & `/v1/sync`
- **Domain**: 11 | **Classification**: `CWE-755` (`OWASP A10:2025`)
- **Location**: `apps/api/src/capabilities/transactions/repository.ts:271-283,405-417`, `packages/contracts/src/state-reducer.ts:186,406-411`, `packages/contracts/src/transactions.schema.ts:149-165`
- **Exploit Scenario / PoC**: `transactions.schema.ts` permits duplicate `splits[].id` entries. REST writes crash on the `(user_id, transaction_id, id)` primary key (`23505` -> `500`), while `state-reducer.ts` deduplicates splits *after* initial validation, causing `splitTotal !== amountMinor` or `splits.length < 2` and crashing `/v1/sync` with an unhandled `ZodError` (`500`).
- **Impact / Blast Radius**: Unhandled `500` failures on REST and sync endpoints from malformed split IDs.
- **Required Fix Contract**: Enforce unique `splits[].id` values inside `refineTransactionRules` in `packages/contracts/src/transactions.schema.ts` so duplicates return `400 VALIDATION_ERROR`.
- **Status**: `OPEN`

### [F-18] [MEDIUM] Email Enumeration on `POST /v1/auth/register`
- **Domain**: 1 | **Classification**: `CWE-204` (`OWASP A07:2025`)
- **Location**: `apps/api/src/capabilities/auth/handler.ts:29-36`, `apps/api/src/capabilities/auth/repository.ts:128-133`
- **Exploit Scenario / PoC**: `handleRegister` runs `findUserByEmail` before `hashPassword` and returns an immediate (`<5 ms`) `409 CONFLICT` (`"An account with this email already exists."`), allowing unauthenticated attackers to enumerate registered emails via status code, body, and timing.
- **Impact / Blast Radius**: Disclosure of registered user email addresses for targeted phishing/stuffing.
- **Required Fix Contract**: Adopt verification-first signup returning a uniform response with constant-work hashing, or strictly pair `409` UX with IP/email rate limiting and CAPTCHA/bot protection.
- **Status**: `OPEN`

### [F-19] [MEDIUM] Orphaned Records on `deleteAccountById` & Stale `reconciliations` on `backup.import` Overwrite
- **Domain**: 4 | **Classification**: `CWE-459 / CWE-840` (`OWASP A06:2025`)
- **Location**: `apps/api/src/capabilities/accounts/repository.ts:208-269`, `packages/contracts/src/state-reducer.ts:820-852`
- **Exploit Scenario / PoC**: `deleteAccountById` deletes an account without checking or cleaning up linked `transactions`, `recurring_commitments`, `sinking_funds`, `quick_presets`, or `balance_reconciliations` (no DB foreign keys exist to `accounts` in `schema.ts`), leaving orphaned transactions whose `PATCH /v1/transactions/:id` fails with `404` and that silently re-attach if an account ID is reused. Likewise, `backup.import` (`overwrite`) leaves old `state.reconciliations` intact (`state-reducer.ts:851`).
- **Impact / Blast Radius**: Orphaned financial records and stale reconciliation history after account deletion or full backup restore.
- **Required Fix Contract**: Reject `deleteAccountById` with `409 CONFLICT` when linked records exist (matching `state-reducer.ts:304-312`) or handle cascade explicitly, and reset `reconciliations: []` in `backup.import` `overwrite` mode.
- **Status**: `OPEN`

### [F-20] [MEDIUM] `scripts/build-vercel.mjs` Uses `execSync` & Leaks Full `process.env` to Frontend Web Bundler
- **Domain**: 3, 5, 12 | **Classification**: `CWE-78 / CWE-526` (`OWASP A05:2025`)
- **Location**: `scripts/build-vercel.mjs:14-23,94-99`
- **Exploit Scenario / PoC**: `run()` uses shell-invoking `execSync` instead of `execFileSync(..., { shell: false })`, and spreads the full `process.env` (containing `DATABASE_URL`, deploy secrets, and CI tokens) into the `expo export --platform web` subprocess, exposing backend secrets to Metro/Babel plugins and build scripts.
- **Impact / Blast Radius**: Unnecessary exposure of backend build-time secrets to frontend bundling plugins.
- **Required Fix Contract**: Replace `execSync` with `execFileSync('pnpm', args, { shell: false, ... })` and pass an explicit allowlisted `env` (`PATH`, `HOME`, `NODE_ENV`, `EXPO_PUBLIC_*`) to the frontend export step.
- **Status**: `OPEN`

### [F-21] [MEDIUM] Docker Image Tag Pinning, Writable Runtime Code & `pnpm audit` Moderate Advisories
- **Domain**: 12 | **Classification**: `CWE-1104 / CWE-284` (`OWASP A03:2025`)
- **Location**: `apps/api/Dockerfile:3,22,24,32`, `apps/api/build.mjs:11`, `pnpm-lock.yaml`
- **Exploit Scenario / PoC**: `Dockerfile` uses mutable `FROM node:22-alpine` instead of an immutable version+SHA-256 digest, copies `vercel.mjs` and `.map` sourcemaps with `--chown=node:node` (making runtime application code writable by `USER node`), omits `HEALTHCHECK` and `--ignore-scripts`, while `pnpm audit` flags 5 moderate / 1 low transitive advisories (`esbuild <=0.24.2` `GHSA-67mh-4wv8-2f99` via `drizzle-kit`, `minimatch` `GHSA-g3hv-75wg-m249` via `@expo/fingerprint`, and `node-forge <=1.4.2` via `@expo/cli`). *(Note: `esbuild`, `minimatch`, and `node-forge` are dev/build-time transitive dependencies rather than `@repo/api` production runtime code.)*
- **Impact / Blast Radius**: Supply-chain drift across rebuilds, dev-server/CLI ReDoS or TLS issues, and writable runtime artifacts if RCE occurs.
- **Required Fix Contract**: Pin `node:22.x.x-alpine@sha256:...`, keep `/app` files owned by `root:root` (`0555`/`0444`) while running as `USER node`, omit `vercel.mjs` and `.map` files from the Railway image, add `HEALTHCHECK`, and update `drizzle-kit`/Expo tooling via `pnpm` overrides or upgrades when patched releases land.
- **Status**: `OPEN`

### [F-22] [MEDIUM] Legacy Web `localStorage` Retention, Non-Dev `http://` Allowed in `getApiBaseUrl` & Unvalidated Custom-Scheme Deep Link Params
- **Domain**: 7, 8 | **Classification**: `CWE-200 / CWE-319 / CWE-939` (`OWASP M3/M4/M5`)
- **Location**: `apps/mobile/src/common/lib/legacy-web-migration.web.ts:7-55`, `apps/mobile/src/common/lib/api-client.ts:68-80`, `apps/mobile/app.json:8`, `apps/mobile/src/app/expenses.tsx:5-25`
- **Exploit Scenario / PoC**: (1) `markLegacyWebBackupMigrated` never deletes `budget_tracker_v3_state` / `budget_tracker_v2_state` from `localStorage`, and on a shared browser the first user to log in silently imports un-scoped local ledger state (`auth-context.tsx:179,189`). (2) `getApiBaseUrl()` permits `http://` in non-dev (`!__DEV__`) builds. (3) `app.json` configures only hijackable custom scheme `budgettracker://` (no iOS Universal Links / Android App Links) and `expenses.tsx` passes `useLocalSearchParams()` (`categoryId`, `accountId`, `search`) without Zod validation or max-length bounds.
- **Impact / Blast Radius**: Cross-user local ledger leakage on shared browsers, accidental cleartext API transport in misconfigured release builds, and unvalidated route params.
- **Required Fix Contract**: Delete legacy `localStorage` keys immediately on migration and prompt before importing un-scoped local data; reject non-`https://` `EXPO_PUBLIC_API_URL` in `!__DEV__` builds; validate `useLocalSearchParams()` with Zod (`max(100)` on `search`); configure verified Universal/App Links before adding any sensitive deep-link routes.
- **Status**: `OPEN`

### [F-23] [LOW] Prototype-Key Collisions on Plain-Object Lookups & Accumulators (`__proto__` / `toString`)
- **Domain**: 3 | **Classification**: `CWE-1321` (`OWASP A08:2025`)
- **Location**: `packages/contracts/src/expenses.ts:200-221`, `packages/contracts/src/transactions.schema.ts:28-30,451-453`, `packages/contracts/src/calculator.ts:405-407`, `apps/mobile/src/features/expenses/screens/expenses-screen.tsx:325-328`
- **Exploit Scenario / PoC**: Plain-object lookups and accumulators (`ACCOUNT_TYPE_LABELS[accountType]`, `LEGACY_EXPENSE_CATEGORY_MAP[categoryId]`, `KEYBOARD_KEY_MAP[key]`, `scheduledCategoryCounts[id]`, `byCategory[id]`) without `Object.hasOwn` resolve `Object.prototype` keys (`"toString"`, `"constructor"`, `"__proto__"`) if passed untrusted IDs from imported backups.
- **Impact / Blast Radius**: UI rendering glitches (`"[object Object]1"`) or unexpected non-null prototype method values.
- **Required Fix Contract**: Replace plain-object dynamic indexing with `Map` / `Object.hasOwn(obj, key)` and reject reserved prototype keys in ID schemas.
- **Status**: `OPEN`

### [F-24] [LOW] Default `scrypt` Cost (`N=16384`), `Math.random()` Client/Sync Op IDs & Missing Postgres RLS Defense-in-Depth
- **Domain**: 2, 5 | **Classification**: `CWE-916 / CWE-338` (`OWASP A04/A01:2025`)
- **Location**: `apps/api/src/core/auth/crypto.ts:7-11`, `apps/mobile/src/features/transactions/api.ts:53,224`, `apps/mobile/src/features/transactions/sync-engine.ts:183`, `apps/mobile/src/features/transactions/components/split-editor-modal.tsx:48`, `apps/api/drizzle/0000_tiny_the_enforcers.sql`
- **Exploit Scenario / PoC**: `hashPassword` relies on Node's `scrypt` default `N=16384` (below OWASP `N >= 32768`); mobile sync `opId`s and local IDs use `Math.random()`; Postgres tables isolate tenants in Drizzle `WHERE userId = ...` queries without database-level Row-Level Security (RLS) defense-in-depth.
- **Impact / Blast Radius**: Lower offline crack resistance if DB hashes leak, low-entropy client IDs, and single-layer tenant isolation.
- **Required Fix Contract**: Raise `scrypt` parameters (paired with auth rate limiting), replace `Math.random()` ID generators with `crypto.randomUUID()` / CSPRNG (`expo-crypto`), and optionally layer Postgres RLS with a non-`BYPASSRLS` app role.
- **Status**: `OPEN`

### [F-25] [LOW] Logging, Audit Trail & Client/Network Boundary Hygiene
- **Domain**: 6, 7, 11 | **Classification**: `CWE-117 / CWE-778 / CWE-209 / CWE-400` (`OWASP A09/A10:2025`)
- **Location**: `apps/api/src/core/logger.ts:50-54`, `apps/api/src/capabilities/health/routes.ts:19-28`, `apps/api/src/vercel.ts:17-36`, `apps/mobile/src/common/components/route-error-boundary.tsx:8-27`, `apps/mobile/src/common/components/route-error-boundary.web.tsx:86-105`, `apps/mobile/src/common/lib/api-client.ts:121-124`, `apps/mobile/src/common/components/external-link.tsx:7-24`, `apps/mobile/src/common/lib/token-storage.ts:24-59`
- **Exploit Scenario / PoC**: (1) `x-request-id` accepts arbitrary characters up to 128 chars without charset validation; (2) no durable security audit log captures failed logins, logouts, account deletions, transaction clears, or reconciliations; (3) public `/health` exposes `uptimeSeconds` and `memoryRssMb`; (4) client error boundaries/forms render raw `error.message`; (5) `apiFetch` lacks an `AbortSignal.timeout`; (6) `ExternalLink` omits `rel="noopener noreferrer"` and `https:`/`http:` check; (7) `restoreVercelRequestUrl` does not reject `//` or `?` in `__path`; (8) `SecureStore.setItemAsync` failures are silently swallowed; (9) `upsertAccountInputSchema.id` / `transactionSchema.id` lack the `:id` param regex/120-char cap.
- **Impact / Blast Radius**: Log injection, missing forensic auditability, hung fetches, and minor info/UX leaks.
- **Required Fix Contract**: Validate `x-request-id` (`/^[A-Za-z0-9._-]{1,64}$/`), add immutable audit logging for security/destructive actions, trim `/health` internals, sanitize non-`ApiClientError` messages in `!__DEV__`, add `AbortSignal.timeout` in `apiFetch`, harden `ExternalLink` and `restoreVercelRequestUrl`, surface `SecureStore` write errors, and align ID schemas.
- **Status**: `OPEN`

---

## Verified Clean Controls
- **Authentication Crypto & Timing Equalization** (`apps/api/src/core/auth/crypto.ts:13-49`, `capabilities/auth/handler.ts:74-88`): Constant-time `timingSafeEqual` on `scrypt` verification, `DUMMY_PASSWORD_HASH` execution on unknown login emails, 256-bit `randomBytes(32)` session tokens stored solely as SHA-256 hashes, and server-side session revocation (`sessions.revokedAt`) on `/v1/auth/logout`.
- **Demo Endpoint Fail-Closed** (`apps/api/src/capabilities/auth/routes.ts:30-39`, `handler.ts:109-113`): `POST /v1/auth/demo` is gated by `allowDemoEndpoint` and `handleDemoLogin` unconditionally throws `403 FORBIDDEN`.
- **Cross-User DB Scoping & Locking** (`apps/api/src/capabilities/*/repository.ts`): All DB reads/writes/deletes scope by verified `session.user.id`; `createTransaction`, `updateTransaction`, and `applyReconciliation` verify ownership of `accountId`/`toAccountId`; `AuthUser` omits `passwordHash` and `stateRevision`; write transactions acquire `SELECT ... FOR UPDATE` on `users`.
- **Parameterized SQL & Error Redaction** (`apps/api/src/**`, `core/errors.ts:31-68`): Zero `sql.raw` or string-interpolated queries; `handleApiError` hides raw stack traces and DB errors on 500s.
- **CORS Allowlist & Bundle Hygiene**: Exact origin allowlist (`allowedOriginSet`, never `*`, no localhost origins in `NODE_ENV=production`); zero hardcoded secrets, zero `.env` committed, zero `EXPO_PUBLIC_` secret leaks, zero `dangerouslySetInnerHTML`/`eval`/`WebView` sinks, and `apps/api/Dockerfile` runs as non-root `USER node`.

---

## Unverified Gaps & Remediation Priority
1. **Immediate Release Blockers (`HIGH`: `F-01` – `F-12`)**:
   - **Backend/Contracts**: **FIXED** (`F-01` – `F-07`)
   - **Web/Mobile/Infra**: **FIXED** (`F-08` – `F-12`)
2. **Hardening (`MEDIUM` / `LOW`: `F-13` – `F-25`)**: CSV formula neutralization, bounded file import & chunking, `receiptUri` scheme/length allowlist, reconciliation delta validation & safe-integer bounds, unique `splits[].id`, enumeration mitigation, orphan cleanup, `execFileSync` + scoped build env, pinned Docker digest/permissions, legacy storage deletion, prod `https://` enforcement, validated deep-link params, `Map` lookups, CSPRNG IDs, and audit/header hygiene.
3. **Unverified Runtime / Cloud Surfaces**: Live Vercel/Railway TLS/HSTS/WAF config, Neon/Postgres `sslmode=require`, backup/PITR retention, and production secret-manager rotation live outside repository code and remain `UNVERIFIED`.
