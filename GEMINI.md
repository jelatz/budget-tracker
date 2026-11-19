# Budget Tracker — Full-Stack Expo Monorepo Architecture

Canonical architecture specification and system design guide for the `budget-tracker` full-stack, cross-platform app (iOS, Android, Web) with a dedicated API and shared contracts.

> [!NOTE]
> This document defines architectural invariants, system contracts, data models, and directory boundaries.
> For developer & agent operational workflows (CLI commands, Expo package installation, SDK docs verification, and platform mechanics), refer to [`AGENTS.md`](./AGENTS.md).

The repository is structured as a **pnpm + Turborepo monorepo** currently in its **skeletal foundation stage**. Core workspaces, toolchains, contracts, and routing conventions are established, while optional backend modules (queues, AI calling, approval gating) are documented as architectural blueprints to be implemented on an opt-in basis as domain features require them.

Rules marked **MUST** are invariants. Folder names under features and capabilities (`example-feature`, `example-crud`, `document-extraction`, `action-approval`) are **placeholders/blueprints**, not hard requirements.
Before implementing a pattern, read its section in `docs/architecture/patterns.md`.

---

## 1. Stack Decisions

| Concern | Choice / Specification |
|---|---|
| Package manager & orchestration | pnpm workspaces (`pnpm-workspace.yaml`) + Turborepo (`turbo.json`) |
| Workspaces | `@repo/mobile` (`apps/mobile`)<br>`@repo/api` (`apps/api`)<br>`@repo/contracts` (`packages/contracts`) |
| Mobile client | Expo SDK 58 + Expo Router (`~58.0.x`), React 19.3.0, React Native 0.88.1 (per `apps/mobile/package.json`) |
| Client server-state | TanStack Query |
| API service | Hono on Node.js LTS |
| Contracts & validation | Zod in `@repo/contracts` |
| Database & ORM | PostgreSQL + Drizzle ORM, migrations via drizzle-kit |
| Queue (opt-in blueprint) | BullMQ on Redis |
| Client token storage | `expo-secure-store` |
| Tests | Vitest (contracts, api), jest-expo (mobile) |
| OTA updates | EAS Update, `runtimeVersion` policy `fingerprint` |
| File naming | kebab-case files (`dashboard-screen.tsx`), PascalCase component exports |

**Monorepo note:** Exactly one React and one React Native version across the whole repository; duplicate versions are unsupported and cause runtime errors. Pin via root pnpm `overrides` if needed. If isolated installs break native builds, set `nodeLinker: hoisted` in `pnpm-workspace.yaml`.

---

## 2. Architecture Overview

```text
[ Clients: iOS / Android / Web (Expo @repo/mobile) ]
                         │  typed requests/responses
                         ▼
             [ @repo/contracts (Zod) ]
                         │
                         ▼
         [ API (Hono @repo/api): auth / RBAC ]
             │                 │
             ▼                 └── enqueue via ──► [ Outbox (opt-in) ]
     [ PostgreSQL ]                                      │
     (source of truth)                                   ▼
             ▲                                    [ Queue (opt-in) ]
             │                                           │
             │                    ┌──────────────────────┴───────────────┐
             │                    ▼                                      ▼
             │        [ Plain-code workers (opt-in) ]   [ AI capability workers (opt-in) ]
             │                    │                                      │
             │                    │                                      ▼
             │                    │                           [ AI call log (opt-in) ]
             │                    ▼
             └──────── [ Approval gate (opt-in) ] ──► [ Irreversible execution ]
```

---

## 3. Invariants (MUST)

1. **No LLM in deterministic logic:** math, money, auth/RBAC, tokens, state machines, validation run in plain TS/SQL.
2. **Money is integer minor units** (e.g. cents, `amountMinor`) in TS and `bigint`/`numeric` in Postgres, with an ISO 4217 currency code. Never JS floating point.
3. **Pass IDs, never summaries/snapshots,** across queue jobs and steps. Workers load fresh rows.
4. **State transitions use compare-and-set:** `UPDATE … WHERE id = $1 AND status = $expected RETURNING *`. Zero rows = conflict. Never read-then-write.
5. **Workers are idempotent.** BullMQ retries and redelivers; a re-run must not repeat side effects or paid AI calls. A reaper resets stale `PROCESSING` rows and re-publishes them through the outbox (`docs/architecture/patterns.md#idempotent-queue-worker`).
6. **Enqueue only via the transactional outbox:** job row + outbox row in the same DB transaction as the business change. Business code never calls `queue.add`; only the outbox relay publishes (`docs/architecture/patterns.md#transactional-outbox`).
7. **Irreversible actions require human approval** (money movement, publishing, external messages, destructive mutations). Approver != requester. AI may propose, never execute (`docs/architecture/patterns.md#approval-gate`).
8. **Every AI call is logged,** success and failure: model, tokens, cost (computed in code from a pricing table), latency. Payloads redacted before storage (`docs/architecture/patterns.md#ai-call-logging`).
9. **Prefer a direct typed function call** to an AI capability. Add the single orchestrator only when routing free-form user input across multiple AI tools. Never peer-to-peer agent meshes.
10. **Secrets never in `EXPO_PUBLIC_*`.** Those values are inlined into the client bundle and readable by anyone.
11. **`catch (error: unknown)`, never `any`.**
12. **KISS (Keep It Simple, Stupid):** Write straightforward, readable plain functions, direct SQL/Drizzle queries, and focused React components rather than clever one-liners, deep abstractions, or OOP class hierarchies/DI containers.
13. **YAGNI (You Aren't Gonna Need It):** Do not build features, abstractions, generic wrappers, or optional modules (`queue`, `outbox`, `ai`, `approval`) until they are actually required by a current use case.
14. **UI/UX Guardrails & Checklist:** All UI/UX changes in `apps/mobile` (screens, components, styles, navigation, assets) must satisfy the UI/UX Guardrails rule (`.gemini/rules/ui-ux-guardrails.md`) and pass the `ui-ux-checker` skill checklist (`.gemini/skills/ui-ux-checker/SKILL.md`): cross-platform parity (safe area insets, no unhandled DOM globals in native code, keyboard avoidance), theme/dark mode compliance, 44x44 minimum touch targets, and complete UI state handling (loading, empty, error, success).

Jobs and approvals are **separate state machines**, both typed in `@repo/contracts`:

```ts
type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
```

---

## 4. Directory Structure

```text
repo/
├── package.json                          # Monorepo root configuration & scripts
├── pnpm-workspace.yaml                   # pnpm workspace definition (apps/*, packages/*)
├── turbo.json                            # Turborepo task pipeline (build, test, lint, typecheck, dev)
├── docs/
│   └── architecture/
│       └── patterns.md                   # Concrete code patterns referenced by this specification
├── packages/
│   └── contracts/                        # [@repo/contracts] Core shared contracts
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── status.ts                 # JobStatus, ApprovalStatus state enums
│           ├── money.ts                  # minor-unit money schema + formatting helpers
│           ├── index.ts                  # barrel export
│           └── <feature>.schema.ts       # (target / opt-in) domain-specific Zod request/response schemas
├── apps/
│   ├── mobile/                           # [@repo/mobile] Expo SDK 58 client
│   │   ├── app.json                      # Expo config and native plugins
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── eas.json                      # build profiles: development, preview, production
│   │   ├── .env.example
│   │   └── src/
│   │       ├── app/                      # routes only (Expo Router file-system routing)
│   │       │   ├── _layout.tsx
│   │       │   ├── _layout.web.tsx       # platform override layout
│   │       │   ├── (tabs)/_layout.tsx
│   │       │   ├── (tabs)/index.tsx
│   │       │   └── +not-found.tsx
│   │       ├── features/                 # domain feature modules
│   │       │   └── <feature>/            # (target / opt-in) e.g. transactions, budget
│   │       │       ├── components/
│   │       │       ├── hooks/            # TanStack Query hooks
│   │       │       ├── screens/          # screen views mounted by src/app/
│   │       │       └── api.ts
│   │       └── common/                   # shared mobile code (not "shared" to avoid clash with contracts)
│   │           ├── components/
│   │           ├── constants/
│   │           ├── hooks/
│   │           └── lib/                  # api-client.ts, secure-store wrappers
│   └── api/                              # [@repo/api] Hono API backend
│       ├── package.json
│       ├── tsconfig.json
│       ├── .env.example
│       ├── drizzle.config.ts
│       ├── drizzle/                      # (target / opt-in) generated SQL migrations
│       └── src/
│           ├── index.ts                  # Hono server entry point
│           ├── core/
│           │   ├── db/                   # Drizzle client, connection pool, schema
│           │   ├── auth/                 # auth token verification, RBAC helpers
│           │   ├── errors.ts             # AppError + code→HTTP status mapping
│           │   ├── env.ts                # Zod-validated environment variables
│           │   ├── queue/                # (target / opt-in) BullMQ connection & queue definitions
│           │   ├── ai/                   # (target / opt-in) model invocation & logging wrappers
│           │   └── outbox/               # (target / opt-in) transactional outbox enqueue & relay
│           └── capabilities/             # modular business capabilities
│               ├── <crud-capability>/    # (target / opt-in) plain-code domain capability
│               │   ├── schema.ts
│               │   ├── handler.ts
│               │   └── routes.ts
│               ├── document-extraction/  # (target / opt-in) AI capability blueprint
│               │   └── {schema,handler,routes,worker}.ts
│               ├── action-approval/      # (target / opt-in) approval gate blueprint
│               └── orchestrator/         # (target / opt-in) multi-tool routing blueprint
```

---

## 5. Optional Modules

| Module | Enable when | Brings in | Requires |
|---|---|---|---|
| Queue | Work exceeds a request's latency limit or needs retries | `core/queue`, `core/outbox`, Redis | none |
| AI | Any LLM call | `core/ai` with logging wrapper | AI call log table |
| Approval gate | Any irreversible action | `action-approval` capability | Queue + outbox |
| Orchestrator | Free-form input routed across 2+ AI tools | `capabilities/orchestrator` | AI |

Enable only what the product needs. A plain CRUD app ships with none of these.

---

## 6. Contracts & Version Skew

Zod schemas in `@repo/contracts` are the **only** client-server contract. The API validates requests with them; mobile parses responses with the same schema (`docs/architecture/patterns.md#typed-api-contract`).

Store builds and OTA updates leave old clients running for months. Therefore:

- **Existing endpoints change additively only:** new optional fields. Never remove/rename fields, change types, or tighten validation.
- **Breaking changes go to a new versioned route** (`/v1` -> `/v2`). The old route stays until the minimum supported app version has passed it.
- **API exposes a minimum supported app version;** the client blocks with an update prompt below it (`docs/architecture/patterns.md#minimum-version-gate`).
- **EAS Update `runtimeVersion` uses the `fingerprint` policy,** so OTA updates never reach incompatible native builds.

---

## 7. Mobile Conventions

- Files in `apps/mobile/src/app/` only mount a screen from `features/*/screens`. No business logic or state handling in routes.
- Diverging components use platform extensions (`.ios.tsx` / `.android.tsx` / `.web.tsx`), imported without the suffix. A platform layout such as `_layout.web.tsx` always has a base `_layout.tsx`.
- Small style differences use `Platform.select` (`docs/architecture/patterns.md#platform-specific-code`).
- Server data flows only through TanStack Query hooks in `features/*/hooks`.
- Auth tokens live in `expo-secure-store`, never AsyncStorage.
- Read env with dot notation: `process.env.EXPO_PUBLIC_API_URL`. Bracket access and destructuring are not inlined.
- No backend/DB/queue logic in Expo API routes (`+api.ts`); only lightweight webhooks or edge transforms.
- All UI/UX changes must adhere to Invariant 14 (UI/UX Guardrails and `ui-ux-checker` validation).

---

## 8. API Conventions

- `routes.ts` validates input with `@repo/contracts` and calls `handler.ts`.
- `handler.ts` holds the logic and is unit-testable without HTTP.
- Env is validated with Zod at startup in `core/env.ts`; crash on missing config.
- Errors are thrown as a typed `AppError` with a code; one error middleware maps codes to HTTP status.
- Migrations are generated by drizzle-kit and never edited after being applied.
- Write an audit-log row for every approval and every irreversible execution.

---

## 9. Testing & CI

- Deterministic logic (money, state transitions, RBAC) **MUST** have unit tests.
- CI runs `pnpm turbo run typecheck lint test`. (See [`AGENTS.md`](./AGENTS.md#3-monorepo-commands) for daily CLI commands and workspace-specific test scripts).
- `apps/mobile/eas.json` defines build profiles `development`, `preview`, `production`.

---

## 10. Trade-offs & Scaling

| Decision | Cost now | Evolution at scale |
|---|---|---|
| Monorepo / Turborepo | Tooling setup, workspace dependency discipline | Turborepo remote caching |
| Capability colocation | Capabilities share one deployable and one DB | Extract hot capabilities into separate services without UI changes |
| AI call logging in Postgres | Log table grows with every call | Stream to an analytics store (ClickHouse/BigQuery) |
| Job-status polling | Extra requests, delayed UI updates | Push status over WebSocket/SSE; Postgres stays the durable store |
| Single orchestrator | One routing point to maintain | Partition by domain; never peer-to-peer agents |

---

## 11. Adoption Checklist

Target state for the monorepo as implementation progresses:

- [ ] Stack in place (pnpm + Turborepo, Expo SDK 58, Hono, Drizzle, TanStack Query, Zod)
- [ ] Invariants 1-14 enforced in code and review
- [ ] Only the needed optional modules enabled
- [ ] `@repo/contracts` shared by both `apps/mobile` and `apps/api`
- [ ] Version-skew rules followed and minimum-version gate implemented
- [ ] AI call logging in place (if AI enabled)
- [ ] Approval gate in place (if irreversible actions exist)
- [ ] Unit tests for deterministic logic and CI running `pnpm turbo run typecheck lint test`
