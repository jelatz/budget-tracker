# Monorepo & Expo (`apps/mobile`) Developer & Agent Guide

Operational guide for developers and AI agents working on `budget-tracker`.
For canonical system architecture, stack decisions, and architectural invariants, refer to [`GEMINI.md`](./GEMINI.md).

---

## 1. Workspace Overview

The monorepo workspaces and full architectural specifications are defined in [`GEMINI.md`](./GEMINI.md#1-stack-decisions):

- **`apps/mobile` (`@repo/mobile`)**: Expo SDK 58 client targeting iOS, Android, and Web.
- **`apps/api` (`@repo/api`)**: Dedicated Hono backend API service.
- **`packages/contracts` (`@repo/contracts`)**: Shared Zod schemas, validation logic, types, and minor-unit money helpers.

Always execute commands from the repository root using `pnpm` and Turborepo workspace filters.

---

## 2. Expo SDK & Docs Verification

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `apps/mobile/package.json` (currently **SDK 58**).
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/` (e.g. `https://docs.expo.dev/versions/v58.0.0/`).
3. For anything else, fetch `https://docs.expo.dev/llms.txt` — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

---

## 3. Monorepo Commands

Always use `pnpm` as the package manager at repository root.

### Root Monorepo Commands
```bash
pnpm turbo run typecheck lint test    # Run typecheck, lint, and test across all workspaces
pnpm turbo run typecheck              # Run typecheck across all workspaces
pnpm turbo run lint                   # Run linter across all workspaces
pnpm turbo run test                   # Run tests across all workspaces
pnpm --filter @repo/mobile start      # Start the Expo development server
pnpm --filter @repo/api dev           # Start the API development server
```

### Expo Package Installation inside `apps/mobile`
```bash
# ALWAYS use expo install to resolve SDK-compatible versions (never plain pnpm add for React Native/Expo packages)
pnpm --filter @repo/mobile exec npx expo install <package>

# Diagnose dependency and configuration issues in mobile
pnpm --filter @repo/mobile exec npx expo doctor

# Fix incompatible package versions
pnpm --filter @repo/mobile exec npx expo install --fix
```

### Workspace-Specific Commands
```bash
pnpm --filter @repo/contracts test    # Test shared contracts
pnpm --filter @repo/api test          # Test API handlers and business logic
pnpm --filter @repo/mobile lint       # Lint mobile app
```

> [!IMPORTANT]
> Run lint and typecheck (`pnpm turbo run typecheck lint`) before declaring any task done.

---

## 4. Navigation & Directory Conventions (`apps/mobile`)

- Use **Expo Router** for all mobile navigation.
- **Routes live in `apps/mobile/src/app/`**: Every file in this directory represents a route or layout navigator (`_layout.tsx`). Keep routes thin; do NOT put business logic, state handling, or complex UI components in `src/app/` (see [`GEMINI.md`](./GEMINI.md#7-mobile-conventions)).
- **Feature modules live in `apps/mobile/src/features/<feature>/`**:
  - `components/`: UI components specific to the feature.
  - `hooks/`: TanStack Query hooks and data mutations.
  - `screens/`: Screen components mounted by route files in `src/app/`.
  - `api.ts`: API calling functions using shared `@repo/contracts`.
- **Shared mobile code lives in `apps/mobile/src/common/`** (named `common` to avoid naming clashes with `@repo/contracts`):
  - `components/`: Reusable cross-feature UI widgets.
  - `constants/`: App-wide constants and theme definitions.
  - `hooks/`: Generic mobile hooks (e.g. `useVersionGate`).
  - `lib/`: Utilities such as `api-client.ts` and storage helpers.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

---

## 5. Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required.
- Run EAS CLI as `npx eas-cli@latest <command>`.
- EAS build profiles (`development`, `preview`, `production`) are configured in `apps/mobile/eas.json`.
- `runtimeVersion` is managed via the `fingerprint` policy so native changes never receive incompatible JS bundles (see [`GEMINI.md`](./GEMINI.md#6-contracts--version-skew)).
- Docs: https://docs.expo.dev/eas/index.md

---

## 6. Native & Monorepo Rules

- **Continuous Native Generation (CNG)**: If `apps/mobile/ios/` and `apps/mobile/android/` directories do not exist, they are generated. Never create or edit native directories by hand — configure native behavior in `apps/mobile/app.json` and config plugins.
- **Expo Go vs Development Builds**: Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- **Prefer Expo Modules**: Prefer recommended Expo modules over third-party native libraries, and check available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md.
- **Single React / React Native Version**: Exactly one React and one React Native version across the whole repository (see [`GEMINI.md`](./GEMINI.md#1-stack-decisions)). Duplicates cause runtime crashes; pin via root `package.json` pnpm `overrides` if needed.
- **Shared Contracts**: Validate all client-server communication using `@repo/contracts` Zod schemas (see [`GEMINI.md`](./GEMINI.md#3-invariants-must) Invariant and [Section 6](./GEMINI.md#6-contracts--version-skew)). Never define ad-hoc request/response types in mobile.
- **UI/UX Guardrails**: All UI/UX modifications must comply with [`.gemini/rules/ui-ux-guardrails.md`](./.gemini/rules/ui-ux-guardrails.md) and pass the `ui-ux-checker` skill checklist (see [`GEMINI.md`](./GEMINI.md#3-invariants-must) Invariant 14).
- **KISS & YAGNI**: Adhere strictly to Invariants 12 & 13 in [`GEMINI.md`](./GEMINI.md#3-invariants-must). Keep implementations simple, direct, and readable; never scaffold unrequested abstractions, generic wrappers, or optional blueprint modules (e.g. queues, outbox, AI callers, approval gates) until actively required.
