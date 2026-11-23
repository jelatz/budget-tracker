import {
  accountResponseSchema,
  accountsListResponseSchema,
  apiErrorResponseSchema,
  applyReconciliationResponseSchema,
  clearTransactionsResponseSchema,
  createDestructiveConfirmation,
  deleteAccountResponseSchema,
  deleteTransactionResponseSchema,
  healthResponseSchema,
  reconciliationResponseSchema,
  reconciliationsListResponseSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
  type AccountResponse,
  type AccountsListResponse,
  type AppErrorCode,
  type ApplyReconciliationInput,
  type ApplyReconciliationResponse,
  type ClearTransactionsResponse,
  type CreateAccountRequest,
  type CreateTransactionRequest,
  type DeleteAccountResponse,
  type DeleteTransactionResponse,
  type HealthResponse,
  type ListTransactionsQuery,
  type PatchTransactionRequest,
  type ReconciliationResponse,
  type ReconciliationsListResponse,
  type TransactionResponse,
  type TransactionsListResponse,
  type UpdateAccountRequest,
} from '@repo/contracts';
import Constants from 'expo-constants';
import type { z } from 'zod';
import { getAuthToken } from './token-storage';

export type ClientErrorCode =
  | AppErrorCode
  | 'CONFIG_ERROR'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode | string;
  readonly requestId?: string;
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    opts: {
      status: number;
      code: ClientErrorCode | string;
      requestId?: string;
      isNetworkError: boolean;
    },
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = opts.status;
    this.code = opts.code;
    this.requestId = opts.requestId;
    this.isNetworkError = opts.isNetworkError;
  }
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  const extraApiUrl = Constants.expoConfig?.extra?.apiUrl;
  const raw =
    typeof envUrl === 'string' && envUrl.trim().length > 0
      ? envUrl.trim()
      : typeof extraApiUrl === 'string' && extraApiUrl.trim().length > 0
        ? extraApiUrl.trim()
        : '';

  if (raw) {
    return raw.replace(/\/+$/, '');
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.location?.origin === 'string' &&
    /^https?:\/\//i.test(window.location.origin)
  ) {
    return window.location.origin.replace(/\/+$/, '');
  }

  throw new ApiClientError(
    'API URL is not configured (EXPO_PUBLIC_API_URL).',
    {
      status: 0,
      code: 'CONFIG_ERROR',
      isNetworkError: false,
    },
  );
}

export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit & { tokenOverride?: string | null },
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token =
    init?.tokenOverride !== undefined
      ? init.tokenOverride
      : await getAuthToken();

  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Network request failed while contacting API server.';
    throw new ApiClientError(message, {
      status: 0,
      code: 'NETWORK_ERROR',
      isNetworkError: true,
    });
  }

  let jsonBody: unknown = null;
  try {
    jsonBody = await response.json();
  } catch (error: unknown) {
    jsonBody = null;
  }

  if (!response.ok) {
    const parsedError = apiErrorResponseSchema.safeParse(jsonBody);
    if (parsedError.success) {
      throw new ApiClientError(parsedError.data.error.message, {
        status: response.status,
        code: parsedError.data.error.code,
        requestId: parsedError.data.error.requestId,
        isNetworkError: false,
      });
    }

    let errorMessage = `Request failed (${response.status})`;
    let errorCode: ClientErrorCode | string = 'HTTP_ERROR';
    if (jsonBody && typeof jsonBody === 'object' && 'error' in jsonBody) {
      const errObj = (jsonBody as { error?: unknown }).error;
      if (errObj && typeof errObj === 'object') {
        const maybeMsg = (errObj as { message?: unknown }).message;
        const maybeCode = (errObj as { code?: unknown }).code;
        if (typeof maybeMsg === 'string' && maybeMsg.trim().length > 0) {
          errorMessage = maybeMsg;
        }
        if (typeof maybeCode === 'string' && maybeCode.trim().length > 0) {
          errorCode = maybeCode;
        }
      }
    }
    throw new ApiClientError(errorMessage, {
      status: response.status,
      code: errorCode,
      requestId: response.headers.get('x-request-id') ?? undefined,
      isNetworkError: false,
    });
  }

  return schema.parse(jsonBody);
}

/**
 * End-to-end typed REST wrappers for core backend capabilities, validated
 * against shared @repo/contracts Zod schemas.
 */
export const apiClient = {
  health: {
    check: (checkDb = false): Promise<HealthResponse> =>
      apiFetch(checkDb ? '/health?check=db' : '/health', healthResponseSchema, {
        method: 'GET',
        tokenOverride: null,
      }),
  },

  accounts: {
    list: (): Promise<AccountsListResponse> =>
      apiFetch('/v1/accounts', accountsListResponseSchema, { method: 'GET' }),

    getById: (id: string): Promise<AccountResponse> =>
      apiFetch(
        `/v1/accounts/${encodeURIComponent(id)}`,
        accountResponseSchema,
        { method: 'GET' },
      ),

    create: (input: CreateAccountRequest): Promise<AccountResponse> =>
      apiFetch('/v1/accounts', accountResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    update: (
      id: string,
      input: UpdateAccountRequest,
    ): Promise<AccountResponse> =>
      apiFetch(
        `/v1/accounts/${encodeURIComponent(id)}`,
        accountResponseSchema,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      ),

    delete: (id: string): Promise<DeleteAccountResponse> =>
      apiFetch(
        `/v1/accounts/${encodeURIComponent(id)}`,
        deleteAccountResponseSchema,
        {
          method: 'DELETE',
          body: JSON.stringify(
            createDestructiveConfirmation('delete-account', id),
          ),
        },
      ),
  },

  transactions: {
    list: (
      query?: Partial<ListTransactionsQuery>,
    ): Promise<TransactionsListResponse> => {
      const params = new URLSearchParams();
      if (query?.accountId) params.set('accountId', query.accountId);
      if (query?.type) params.set('type', query.type);
      if (query?.limit !== undefined) params.set('limit', String(query.limit));
      if (query?.offset !== undefined)
        params.set('offset', String(query.offset));
      const qs = params.toString();
      return apiFetch(
        qs ? `/v1/transactions?${qs}` : '/v1/transactions',
        transactionsListResponseSchema,
        { method: 'GET' },
      );
    },

    getById: (id: string): Promise<TransactionResponse> =>
      apiFetch(
        `/v1/transactions/${encodeURIComponent(id)}`,
        transactionResponseSchema,
        { method: 'GET' },
      ),

    create: (input: CreateTransactionRequest): Promise<TransactionResponse> =>
      apiFetch('/v1/transactions', transactionResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    update: (
      id: string,
      input: PatchTransactionRequest,
    ): Promise<TransactionResponse> =>
      apiFetch(
        `/v1/transactions/${encodeURIComponent(id)}`,
        transactionResponseSchema,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      ),

    delete: (id: string): Promise<DeleteTransactionResponse> =>
      apiFetch(
        `/v1/transactions/${encodeURIComponent(id)}`,
        deleteTransactionResponseSchema,
        { method: 'DELETE' },
      ),

    clearAll: (): Promise<ClearTransactionsResponse> =>
      apiFetch('/v1/transactions/clear', clearTransactionsResponseSchema, {
        method: 'POST',
        body: JSON.stringify(
          createDestructiveConfirmation('clear-transactions', 'all'),
        ),
      }),
  },

  reconcile: {
    list: (): Promise<ReconciliationsListResponse> =>
      apiFetch('/v1/reconcile', reconciliationsListResponseSchema, {
        method: 'GET',
      }),

    getById: (id: string): Promise<ReconciliationResponse> =>
      apiFetch(
        `/v1/reconcile/${encodeURIComponent(id)}`,
        reconciliationResponseSchema,
        { method: 'GET' },
      ),

    apply: (
      input: ApplyReconciliationInput,
    ): Promise<ApplyReconciliationResponse> =>
      apiFetch('/v1/reconcile', applyReconciliationResponseSchema, {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          ...createDestructiveConfirmation(
            'reconcile-account',
            input.accountId,
          ),
        }),
      }),
  },
};
