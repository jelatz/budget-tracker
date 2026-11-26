import { describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  asyncJobRecordSchema,
  createDestructiveConfirmation,
  healthResponseSchema,
  listTransactionsQuerySchema,
  updateAccountRequestSchema,
  verifyConfirmationToken,
} from '../index';

describe('shared API contracts', () => {
  it('validates standardized API error envelopes', () => {
    const parsed = apiErrorResponseSchema.parse({
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'Explicit confirmation required.',
        requestId: 'req-123',
      },
    });
    expect(parsed.error.code).toBe('CONFIRMATION_REQUIRED');
    expect(parsed.error.requestId).toBe('req-123');
  });

  it('generates and verifies deterministic destructive confirmation tokens', () => {
    const confirmation = createDestructiveConfirmation(
      'delete-account',
      'account-bank',
    );
    expect(confirmation.confirmAction).toBe(true);
    expect(confirmation.confirmationToken).toBe('delete-account:account-bank');
    expect(
      verifyConfirmationToken(confirmation, 'delete-account', 'account-bank'),
    ).toBe(true);
    expect(
      verifyConfirmationToken(confirmation, 'delete-account', 'account-cash'),
    ).toBe(false);
    expect(
      verifyConfirmationToken(confirmation, 'clear-transactions', 'all'),
    ).toBe(false);
    expect(verifyConfirmationToken(undefined, 'delete-account', 'account-bank')).toBe(
      false,
    );
  });

  it('validates health and async job status schemas', () => {
    const health = healthResponseSchema.parse({
      status: 'ok',
      service: 'budget-tracker-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 12,
      memoryRssMb: 38.5,
      database: 'ok',
    });
    expect(health.status).toBe('ok');

    const job = asyncJobRecordSchema.parse({
      id: 'job-1',
      type: 'ledger.export',
      status: 'COMPLETED',
      resultRefId: 'export-42',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(job.status).toBe('COMPLETED');
  });

  it('validates capability query and mutation schemas', () => {
    const query = listTransactionsQuerySchema.parse({
      accountId: 'account-bank',
      limit: '25',
      offset: '0',
    });
    expect(query.limit).toBe(25);
    expect(query.offset).toBe(0);

    expect(() => updateAccountRequestSchema.parse({})).toThrow();
    expect(updateAccountRequestSchema.parse({ name: 'Checking', dueDay: 15 }).name).toBe(
      'Checking',
    );
  });
});
