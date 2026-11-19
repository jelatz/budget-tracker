# Architecture Patterns

Reference implementations and design patterns for the `budget-tracker` full-stack Expo monorepo (`pnpm` workspaces, Turborepo, Expo Router SDK 58, Hono, Drizzle ORM / PostgreSQL, BullMQ, Zod, TanStack Query).

The architectural invariants enforced by these patterns are defined in [GEMINI.md](../../GEMINI.md). Copy a pattern when implementing a capability and adapt names to your domain.

---

## Monorepo Workspace & Skeletal Setup

The repository is structured into three workspaces connected via `pnpm-workspace.yaml` and choreographed by Turborepo (`turbo.json`):

```text
packages/contracts (@repo/contracts)
       │                    │
       ▼ (workspace:*)      ▼ (workspace:*)
apps/api (@repo/api)    apps/mobile (@repo/mobile)
```

- **`pnpm-workspace.yaml`**:
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
- **`turbo.json` pipeline**:
  ```json
  {
    "$schema": "https://turbo.build/schema.json",
    "tasks": {
      "build": {
        "dependsOn": ["^build"],
        "outputs": ["dist/**"]
      },
      "typecheck": {
        "dependsOn": ["^typecheck"]
      },
      "lint": {},
      "test": {
        "dependsOn": ["^build"]
      },
      "dev": {
        "cache": false,
        "persistent": true
      }
    }
  }
  ```

### Pattern Classification: Core vs Opt-In

> [!IMPORTANT]
> **KISS & YAGNI Principle**:
> Only implement opt-in patterns when required by an active, concrete feature requirement. Do not prematurely scaffold background workers, transactional outbox tables, or AI logging layers for simple CRUD workflows. Keep all implementations as straightforward, readable TypeScript functions without unnecessary abstraction layers or over-engineering.

| Pattern | Category | Purpose | When to Implement |
|---|---|---|---|
| **[Typed API contract](#typed-api-contract)** | **Core** | End-to-end type safety between Hono and React Native | Every client-server endpoint |
| **[Minimum version gate](#minimum-version-gate)** | **Core** | Guard against backwards-incompatible client versions | App launch & initialization |
| **[Platform-specific code](#platform-specific-code)** | **Core** | Native iOS/Android vs Web styling and component splits | Multi-platform UI divergence |
| **[AI call logging](#ai-call-logging)** | **Opt-In** | Structured logging, cost tracking, and payload redaction | When adding LLM / AI capabilities |
| **[Idempotent queue worker](#idempotent-queue-worker)** | **Opt-In** | BullMQ workers with atomic claim & redelivery guards | When moving tasks to background jobs |
| **[Transactional outbox](#transactional-outbox)** | **Opt-In** | Atomic database mutations and queue dispatch | When jobs are triggered by DB state changes |
| **[Approval gate](#approval-gate)** | **Opt-In** | Human authorization gate for irreversible operations | Financial transfers, irreversible data changes |

---

## Core Patterns

### Typed API contract

One Zod schema in `@repo/contracts` serves as the single source of truth for the API request validator, the mobile response parser, and TypeScript static types.

```ts
// packages/contracts/src/example-item.schema.ts
import { z } from 'zod';

export const exampleItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  amountMinor: z.number().int(), // integer minor units (e.g. cents)
  currency: z.string().length(3), // ISO 4217 currency code
  createdAt: z.string().datetime(),
});

export const createExampleItemInput = exampleItemSchema.omit({ id: true, createdAt: true });

export type ExampleItem = z.infer<typeof exampleItemSchema>;
export type CreateExampleItemInput = z.infer<typeof createExampleItemInput>;
```

```ts
// apps/api/src/capabilities/example-crud/routes.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createExampleItemInput } from '@repo/contracts';
import { createExampleItem } from './handler';

export const exampleCrudRoutes = new Hono().post(
  '/v1/example-items',
  zValidator('json', createExampleItemInput),
  async (c) => {
    const item = await createExampleItem(c.req.valid('json'));
    return c.json(item, 201);
  },
);
```

```ts
// apps/mobile/src/common/lib/api-client.ts
import * as SecureStore from 'expo-secure-store';
import type { z } from 'zod';

export async function apiFetch<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  // Dot notation only: Expo inlines process.env.EXPO_PUBLIC_*; bracket access or destructuring is not inlined.
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) throw new Error('EXPO_PUBLIC_API_URL is not set');

  const token = await SecureStore.getItemAsync('accessToken');
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${path}`);
  return schema.parse(await res.json());
}
```

```ts
// apps/mobile/src/features/example-feature/hooks/use-create-example-item.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { exampleItemSchema, type CreateExampleItemInput } from '@repo/contracts';
import { apiFetch } from '@/common/lib/api-client';

export function useCreateExampleItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExampleItemInput) =>
      apiFetch('/v1/example-items', exampleItemSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['example-items'] }),
  });
}
```

---

### Minimum version gate

The API exposes the minimum supported client version; the mobile app verifies compatibility on startup and prompts for update if deprecated.

```ts
// apps/api/src/core/meta.ts
import { Hono } from 'hono';
import { env } from './env';

export const metaRoutes = new Hono().get('/v1/meta', (c) =>
  c.json({ minSupportedVersion: env.MIN_SUPPORTED_VERSION }),
);
```

```ts
// apps/mobile/src/common/hooks/use-version-gate.ts
import * as Application from 'expo-application';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/common/lib/api-client';

const metaSchema = z.object({ minSupportedVersion: z.string() });

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useVersionGate(): 'ok' | 'update-required' | 'unknown' {
  const { data, isError } = useQuery({
    queryKey: ['meta'],
    queryFn: () => apiFetch('/v1/meta', metaSchema),
    retry: false,
  });
  const current = Application.nativeApplicationVersion;

  // Loading, network failure, or no native version: never block the user.
  if (isError || !data || !current) return 'unknown';
  return compareVersions(current, data.minSupportedVersion) < 0 ? 'update-required' : 'ok';
}
```

---

### Platform-specific code

File suffixes separate platform differences:
- `date-picker.ios.tsx`: native iOS wheel picker
- `date-picker.android.tsx`: native Android date dialog
- `date-picker.web.tsx`: HTML5 date input
- Consumers import without a suffix: `@/features/example-feature/components/date-picker`

Expo Router layouts follow the same rule: `_layout.web.tsx` requires a base `_layout.tsx` fallback in the same directory.

For small inline differences, use `Platform.select`:

```ts
// apps/mobile/src/features/example-feature/components/card.styles.ts
import { Platform, StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      web: { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' },
    }),
  },
});
```

---

## Opt-In Patterns

### AI call logging

Every model call goes through a central wrapper. It logs on success and failure, redacts sensitive payloads, stores inputs/outputs as `jsonb`, and computes costs from a fixed pricing table.

```ts
// apps/api/src/core/db/schema.ts (excerpt)
import { pgTable, uuid, text, integer, jsonb, numeric, timestamp } from 'drizzle-orm/pg-core';

export const aiCallLogs = pgTable('ai_call_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobRunId: uuid('job_run_id'),
  capability: text('capability').notNull(),
  model: text('model').notNull(),
  status: text('status', { enum: ['success', 'error'] }).notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull(), // decimal string
  latencyMs: integer('latency_ms').notNull(),
  inputPayload: jsonb('input_payload').notNull(),
  outputPayload: jsonb('output_payload'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

```ts
// apps/api/src/core/ai/call-model.ts
import { db } from '../db/client';
import { aiCallLogs } from '../db/schema';

// Fill from provider's pricing list. USD per 1M tokens, keyed by model id.
const PRICING: Record<string, { input: number; output: number }> = {
  'example-model-large': { input: 0, output: 0 },
  'example-model-small': { input: 0, output: 0 },
};

export interface CallModelOpts {
  capability: string;
  model: string;
  jobRunId?: string;
  input: unknown;
  redact: (value: unknown) => unknown;
}

export interface ModelResult<T> {
  output: T;
  promptTokens: number;
  completionTokens: number;
}

type LogEntry = Omit<typeof aiCallLogs.$inferInsert, 'capability' | 'model' | 'jobRunId' | 'inputPayload'>;

export async function callModel<T>(
  opts: CallModelOpts,
  invoke: () => Promise<ModelResult<T>>,
): Promise<T> {
  const price = PRICING[opts.model];
  if (!price) throw new Error(`Model "${opts.model}" has no entry in PRICING`);

  const writeLog = async (entry: LogEntry): Promise<void> => {
    try {
      await db.insert(aiCallLogs).values({
        ...entry,
        capability: opts.capability,
        model: opts.model,
        jobRunId: opts.jobRunId ?? null,
        inputPayload: opts.redact(opts.input),
      });
    } catch (logError: unknown) {
      // A failed log write must never mask the model result or error.
      console.error('ai_call_logs insert failed', logError);
    }
  };

  const startedAt = performance.now();
  let result: ModelResult<T>;
  try {
    result = await invoke();
  } catch (error: unknown) {
    await writeLog({
      status: 'error',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: '0',
      latencyMs: Math.round(performance.now() - startedAt),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const cost =
    (result.promptTokens * price.input + result.completionTokens * price.output) / 1_000_000;
  await writeLog({
    status: 'success',
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    costUsd: cost.toFixed(6),
    latencyMs: Math.round(performance.now() - startedAt),
    outputPayload: opts.redact(result.output),
  });
  return result.output;
}
```

---

### Idempotent queue worker

The queue payload carries only `jobRunId`. The worker claims the job atomically using compare-and-set, guards against repeating side-effects / paid calls on redelivery, and persists output to PostgreSQL.

```ts
// apps/api/src/capabilities/document-extraction/worker.ts
import { Worker, Job } from 'bullmq';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../core/db/client';
import { jobRuns, documents, extractions } from '../../core/db/schema';
import { connection } from '../../core/queue';
import { extractDocument } from './handler';

interface Payload {
  jobRunId: string;
}

export const documentExtractionWorker = new Worker<Payload>(
  'document-extraction',
  async (job: Job<Payload>): Promise<void> => {
    const { jobRunId } = job.data;

    // (a) Atomic claim. Zero rows means already claimed or finished: no-op.
    const [jobRun] = await db
      .update(jobRuns)
      .set({ status: 'PROCESSING', attempts: sql`${jobRuns.attempts} + 1`, startedAt: new Date() })
      .where(and(eq(jobRuns.id, jobRunId), eq(jobRuns.status, 'QUEUED')))
      .returning();
    if (!jobRun) return;

    try {
      // (b) Load fresh entity by ID.
      const document = await db.query.documents.findFirst({
        where: eq(documents.id, jobRun.entityId),
      });
      if (!document) throw new Error(`Document ${jobRun.entityId} not found`);

      // (c) Redelivery guard: never repeat an expensive/paid call if a result already exists.
      const existing = await db.query.extractions.findFirst({
        where: eq(extractions.documentId, document.id),
      });
      const data = existing ? undefined : await extractDocument({ jobRunId, document });

      // (d) Persist result and mark completed in a single atomic transaction.
      await db.transaction(async (tx) => {
        if (data !== undefined) {
          await tx
            .insert(extractions)
            .values({ documentId: document.id, data })
            .onConflictDoNothing({ target: extractions.documentId });
        }
        await tx
          .update(jobRuns)
          .set({ status: 'COMPLETED', completedAt: new Date() })
          .where(and(eq(jobRuns.id, jobRunId), eq(jobRuns.status, 'PROCESSING')));
      });
    } catch (error: unknown) {
      // (e) Retry-aware failure handling.
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await db
        .update(jobRuns)
        .set(
          willRetry
            ? { status: 'QUEUED' }
            : { status: 'FAILED', error: message, completedAt: new Date() },
        )
        .where(and(eq(jobRuns.id, jobRunId), eq(jobRuns.status, 'PROCESSING')));
      throw error;
    }
  },
  { connection },
);
```

---

### Transactional outbox

Atomic publishing prevents phantom queue jobs or lost jobs across crashes: write the job intent row and the outbox row in the exact same transaction as the business modification, and let a dedicated outbox relay handle publishing.

```ts
// apps/api/src/core/outbox/enqueue.ts
import { db } from '../db/client';
import { jobRuns, outbox } from '../db/schema';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function enqueueInTx(
  tx: Tx,
  params: { queue: string; type: string; entityId: string },
): Promise<string> {
  const [jobRun] = await tx
    .insert(jobRuns)
    .values({ type: params.type, status: 'QUEUED', entityId: params.entityId })
    .returning({ id: jobRuns.id });
  await tx.insert(outbox).values({ queue: params.queue, jobRunId: jobRun.id, publishedAt: null });
  return jobRun.id;
}
```

```ts
// apps/api/src/core/outbox/relay.ts
import { eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { outbox } from '../db/schema';
import { queues } from '../queue';

export async function relayOutbox(): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outbox)
      .where(isNull(outbox.publishedAt))
      .limit(100)
      .for('update', { skipLocked: true }); // concurrent relays take disjoint rows

    for (const row of rows) {
      const queue = queues[row.queue];
      if (!queue) throw new Error(`Unknown queue "${row.queue}" in outbox row ${row.id}`);
      // jobId = outbox row id: prevents duplicate jobs if relay crashes between publish and commit
      await queue.add(
        row.queue,
        { jobRunId: row.jobRunId },
        { jobId: row.id, attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
      );
      await tx.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, row.id));
    }
    return rows.length;
  });
}

export function startOutboxRelay(intervalMs = 1000): NodeJS.Timeout {
  let running = false;
  return setInterval(() => {
    if (running) return;
    running = true;
    relayOutbox()
      .catch((error: unknown) => console.error('outbox relay failed', error))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
}
```

---

### Approval gate

Critical, irreversible business mutations (e.g. fund transfers, batch deletions) require an explicit multi-factor human approval step. The requester cannot approve their own action.

```ts
// apps/api/src/capabilities/action-approval/handler.ts
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../core/db/client';
import { actionRequests, auditLog } from '../../core/db/schema';
import { verifyTwoFactorAndRole } from '../../core/auth';
import { AppError } from '../../core/errors';
import { enqueueInTx } from '../../core/outbox/enqueue';

export async function approveAction(params: {
  actionId: string;
  approverId: string;
  twoFactorToken: string;
}): Promise<void> {
  const { actionId, approverId, twoFactorToken } = params;
  await verifyTwoFactorAndRole(approverId, twoFactorToken, 'APPROVER');

  await db.transaction(async (tx) => {
    const [approved] = await tx
      .update(actionRequests)
      .set({ status: 'APPROVED', approvedBy: approverId, approvedAt: new Date() })
      .where(
        and(
          eq(actionRequests.id, actionId),
          eq(actionRequests.status, 'PENDING_APPROVAL'),
          ne(actionRequests.requestedBy, approverId),
        ),
      )
      .returning({ id: actionRequests.id });
    if (!approved) {
      throw new AppError('CONFLICT', 'Action is not pending approval or approver is the requester');
    }

    await tx.insert(auditLog).values({
      actorId: approverId,
      action: 'ACTION_APPROVED',
      entityType: 'action_request',
      entityId: actionId,
    });
    await enqueueInTx(tx, { queue: 'execute-action', type: 'EXECUTE_ACTION', entityId: actionId });
  });
}

export async function rejectAction(params: {
  actionId: string;
  approverId: string;
  twoFactorToken: string;
}): Promise<void> {
  const { actionId, approverId, twoFactorToken } = params;
  await verifyTwoFactorAndRole(approverId, twoFactorToken, 'APPROVER');

  await db.transaction(async (tx) => {
    const [rejected] = await tx
      .update(actionRequests)
      .set({ status: 'REJECTED', rejectedBy: approverId, rejectedAt: new Date() })
      .where(and(eq(actionRequests.id, actionId), eq(actionRequests.status, 'PENDING_APPROVAL')))
      .returning({ id: actionRequests.id });
    if (!rejected) throw new AppError('CONFLICT', 'Action is not pending approval');
    await tx.insert(auditLog).values({
      actorId: approverId,
      action: 'ACTION_REJECTED',
      entityType: 'action_request',
      entityId: actionId,
    });
  });
}
```
