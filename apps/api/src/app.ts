import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  createProtectedAuthRoutes,
  createPublicAuthRoutes,
} from './capabilities/auth/routes';
import { createCategoryRoutes } from './capabilities/categories/routes';
import { createPlanningRoutes } from './capabilities/planning/routes';
import { createPortabilityRoutes } from './capabilities/portability/routes';
import { createReconciliationRoutes } from './capabilities/reconciliation/routes';
import { createSettingsRoutes } from './capabilities/settings/routes';
import { createTransactionRoutes } from './capabilities/transactions/routes';
import { createWalletRoutes } from './capabilities/wallets/routes';
import { createRequireAuth } from './core/auth/middleware';
import type { AppDb } from './core/db/client';
import { errorHandler } from './core/errors';
import { createMetaRoutes } from './core/meta';

export interface CreateAppOptions {
  db: AppDb;
  minSupportedVersion?: string;
  corsOrigin?: string;
}

export function createApp({
  db,
  minSupportedVersion = '1.0.0',
  corsOrigin = '*',
}: CreateAppOptions) {
  const app = new Hono();

  const origins =
    corsOrigin === '*'
      ? '*'
      : corsOrigin
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);

  app.use(
    '*',
    cors({
      origin: origins,
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.onError(errorHandler);

  // Public routes
  app.route('/', createMetaRoutes(minSupportedVersion));
  app.route('/', createPublicAuthRoutes(db));

  // Protected /v1/* routes
  const protectedV1 = new Hono();
  protectedV1.use('*', createRequireAuth(db));
  protectedV1.route('/', createProtectedAuthRoutes(db));
  protectedV1.route('/', createWalletRoutes(db));
  protectedV1.route('/', createCategoryRoutes(db));
  protectedV1.route('/', createSettingsRoutes(db));
  protectedV1.route('/', createTransactionRoutes(db));
  protectedV1.route('/', createPlanningRoutes(db));
  protectedV1.route('/', createReconciliationRoutes(db));
  protectedV1.route('/', createPortabilityRoutes(db));

  app.route('/', protectedV1);

  return app;
}
