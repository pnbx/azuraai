# Azura Phase 1 & 2 Implementation Status

## Overview
This repository contains the foundational implementation for **Phase 1** (database schema, authentication, core tables) and **Phase 2** (API key system and wallet/ledger operations) of the Azura AI API platform.

## Phase 1

### Summary
- **Database Schema** (`supabase/001_schema.sql`)
  - `users` – 1:1 with Supabase `auth.users`, UUID PK, RLS (SELECT own only)
  - `providers` – Platform configuration (no provider secrets stored)
  - `model_catalog` – Azura canonical model IDs (`azura_model_id`), provider mapping
  - `pricing_rules` & `markup_rules` – Platform‑owned, versioned, overlapping‑period prevention via GiST exclusion using `tstzrange` (no floating‑point money)
  - `api_keys` – Hashed API keys, `revoked_at` column, RLS (SELECT own metadata only)
  - `balances` – User credit balance (integer cents), RLS (SELECT own only)
  - `wallet_transactions` – Append‑only ledger, RLS (SELECT own only)
  - `usage_logs` – Immutable audit/billing logs, RLS (SELECT own only)
  - `api_rate_limits` – Infrastructure table, no normal‑user access

- **Row‑Level Security (RLS)**
  - 6 user‑facing SELECT policies (`users`, `api_keys`, `usage_logs`, `balances`, `wallet_transactions`, `model_catalog`)
  - Platform‑owned tables (`pricing_rules`, `markup_rules`, `providers`, `api_rate_limits`) have **no** normal‑user policies → effectively inaccessible
  - All sensitive tables use `auth.uid()` ownership checks, never expose provider/API secrets

- **Database Dependencies**
  - `btree_gist` extension (required for UUID GiST exclusion constraints)
  - No floating‑point arithmetic for monetary values (all `BIGINT` cents)
  - Excludes Prisma, external Redis, Docker orchestration – pure Supabase + Next.js

- **Authentication**
  - Dashboard uses Supabase Auth (existing `supabase` client)
  - No custom JWT layer – Supabase Auth sessions are sufficient for Phase 1
  - API‑key authentication is separate (see Phase 2)

- **Development Setup**
  ```bash
  npm install
  npm run dev
  ```
  - Environment variables: `.env.local` (must contain `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)

### Security Highlights
- **Provider secrets never stored** – kept in Vercel server‑only env vars
- **No API key exposure** – raw secrets shown only once, stored only as `key_hash`
- **Financial immutability** – balances and ledger are append‑only, server‑side mutations only
- **No floating‑point money** – integer cents throughout
- **Robust RLS** – normal users cannot mutate, create, or delete financial/audit tables
- **JWT‑style auth** – Phase 1 uses Supabase Auth sessions; no custom JWT needed
- **Client‑server separation** – `lib/supabase.ts` uses public key only; `supabase/admin.ts` uses service‑role key (never bundled)

### Migration Status
All Phase 1 migrations are applied to the LIVE Supabase project (`https://japamxendclmksbdokau.supabase.co`).

## Phase 2

### Summary
Implemented **API key system** and **wallet/ledger** operations:

#### API Key System (`lib/api-keys.ts`)
- `generateApiKeySecret()` – cryptographically secure (256‑bit) random secret, returns raw + SHA‑256 hash
- `verifyApiKeySecret()` – verifies a presented secret against stored hash
- `formatApiKeyForDisplay()` – adds `az_` prefix, shown exactly once to the user
- **Database schema** (`api_keys` table) – `revoked_at` column added for soft‑deletion, RLS policy (`api_keys_select_own`) allows users to SELECT only their own keys
- **Security**
  - Raw secrets never stored
  - Hash verification only
  - Revocation via `revoke_api_key` RPC (ownership‑checked, server‑side)

#### Wallet / Ledger System (`lib/wallet.ts`)
- `balances` – current balance (integer cents), RLS SELECT‑own only
- `wallet_transactions` – append‑only ledger, RLS SELECT‑own only
- **RPC functions** (`20260907000002_phase2_wallet_api.sql`)
  - `credit_balance(user_id, amount_cents, reference_id, metadata)` – atomically credits balance, creates ledger row, prevents negative balance
  - `debit_balance(user_id, amount_cents, reference_id, metadata)` – atomically debits balance, creates ledger row, prevents negative balance
  - `revoke_api_key(key_id, user_id)` – ownership‑verified revocation
- **Server‑side only** – all mutations use Supabase admin client, protected by ownership checks and atomic transactions
- **Security**
  - No direct client‑side balance mutations
  - SQL execution uses `SELECT ... FOR UPDATE` locks to prevent race conditions
  - Owner verification in `revoke_api_key` prevents cross‑user key revocation

#### API Routes (not yet implemented – **Phase 3 scope**)
The following endpoints will be added in Phase 3:
- `POST /api/api-keys` – create API key (returns formatted secret)
- `GET /api/api-keys` – list user’s API keys
- `DELETE /api/api-keys/:id` – revoke API key
- `GET /api/wallet/balance` – current balance
- `GET /api/wallet/transactions` – transaction history
- `POST /api/wallet/credit` – credit balance
- `POST /api/wallet/debit` – debit balance
- `POST /api/wallet/adjust` – adjust balance (admin use)

#### Phase 2 Security Overview
- **API key security** – raw secrets never stored, SHA‑256 hash only, formatted for display, ownership‑verified revocation
- **Financial security** – balances never negative, ledger immutable, server‑side transactions with ownership checks
- **No provider secrets** – API keys and provider credentials kept in environment variables only
- **No custom JWT** – Phase 2 continues using Supabase Auth for dashboard; API‑key auth is a separate mechanism
- **Proper access control** – RLS protects tables, RPC functions enforce ownership, no client‑side mutation exposure

### Phase 2 Migration Status
- RPC functions (`credit_balance`, `debit_balance`, `revoke_api_key`) defined in `supabase/migrations/20260907000002_phase2_wallet_api.sql`
- Not yet applied to LIVE Supabase – **pending approval**
- Ready to apply once Phase 2 security fixes are validated

### Build & Lint
```bash
npm run lint   # zero errors
npm run build  # TypeScript compilation successful
```

## Project Structure
```
/e/Azura/
├── app/                 # Next.js pages
├── lib/
│   ├── api-keys.ts     # API key utilities
│   ├── supabase.ts     # client Supabase (public)
│   └── wallet.ts       # wallet / ledger utilities
├── supabase/
│   ├── 001_schema.sql  # Phase 1 schema + RLS
│   ├── migrations/     # migration files
│   │   ├── 20260907000001_initial_schema.sql
│   │   └── 20260907000002_phase2_wallet_api.sql
│   └── admin.ts        # admin Supabase client (service‑role)
├── package.json
├── tsconfig.json
└── .env.example
└── .env.local       # (DO NOT COMMIT) Supabase keys
└── .gitignore
```

## Future Phases (Not Started)
- **Phase 3** – API gateway, AvalAI integration, streaming, rate limiting, dashboard UI, payment systems
- **Phase 4** – Provider failover, analytics, admin tools, documentation

---
**Current Status:** Phase 1 complete, Phase 2 **READY TO APPLY** once security fixes are confirmed.
**Next Step:** Apply Phase 2 migration to live database and implement Phase 2 API routes.