# Budget Tracker (Web, Android & iOS)

Personal multi-device PHP budget tracker built as a **pnpm + Turborepo** monorepo with:
- **`apps/mobile` (`@repo/mobile`)**: Expo SDK 58 + Expo Router + NativeWind + TanStack Query (iOS, Android, Web)
- **`apps/api` (`@repo/api`)**: Hono + Drizzle ORM + PostgreSQL backend
- **`packages/contracts` (`@repo/contracts`)**: Shared Zod schemas, integer minor-unit PHP money math, calculator engine, and dashboard analytics

---

## Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Configure env files
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env

# 4. Run database migrations
pnpm --filter @repo/api db:migrate

# 5. Start API and Expo (in separate terminals)
pnpm api
pnpm start
```

### Verification Commands
```bash
pnpm turbo run typecheck lint test
pnpm --filter @repo/api build
```

---

## Deploying for Personal Multi-Device Use (Web + Android + iOS)

1. **Database & API (`@repo/api`)**
   - Provision PostgreSQL (e.g., Neon free tier or self-hosted Postgres via `docker compose --profile full up -d --build`).
   - Deploy `apps/api/Dockerfile` (Fly.io, Render, Railway, or a Tailscale host) with `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (for migrations), and `CORS_ORIGIN`.
   - Run `pnpm --filter @repo/api db:migrate` against the production database.

2. **Web Client (`@repo/mobile` static SPA)**
   - Set `EXPO_PUBLIC_API_URL=https://<your-api-host>` and export static files:
     ```bash
     pnpm --filter @repo/mobile exec npx expo export --platform web
     ```
   - Host `apps/mobile/dist/` on Cloudflare Pages, Vercel, or Netlify.

3. **Android Phone (Direct APK)**
   - Build an installable APK via EAS with `EXPO_PUBLIC_API_URL` configured in EAS environment variables:
     ```bash
     cd apps/mobile && npx eas-cli@latest build -p android --profile preview
     ```

4. **iOS Phone**
   - **No Apple Developer account**: Open your hosted Web URL in iOS Safari → Share → **Add to Home Screen** (or run via Expo Go on LAN/tunnel).
   - **With Apple Developer account**: Run `npx eas-cli@latest build -p ios --profile preview` for ad-hoc/TestFlight installation.
