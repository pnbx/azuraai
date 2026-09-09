-- ============================================================
-- PHASE 3 DATABASE VERIFICATION - READ-ONLY (Corrected)
-- All queries are SELECT/catalog only. No modifications.
-- Run these in Supabase SQL Editor after Phase 3 migration.
-- ============================================================

-- 1. Verify exact init_user_balance() function signature
-- Checks: function oid, name, identity arguments, return type, schema name
-- Ensures exactly one matching public function with zero arguments exists.
WITH candidate AS (
    SELECT
        oid,
        proname,
        pg_get_function_identity_arguments(oid) AS identity_arguments,
        pg_get_function_result(oid) AS return_type,
        (SELECT nspname FROM pg_namespace WHERE oid = pronamespace) AS schema_name
    FROM pg_proc
    WHERE proname = 'init_user_balance'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
),
cnt AS (
    SELECT COUNT(*) AS n FROM candidate
)
SELECT
    'FUNCTION: exact init_user_balance signature' AS check_type,
    cnt.n AS function_count,
    CASE WHEN cnt.n = 1 THEN (SELECT oid FROM candidate LIMIT 1) END AS function_oid,
    CASE WHEN cnt.n = 1 THEN (SELECT proname FROM candidate LIMIT 1) END AS function_name,
    CASE WHEN cnt.n = 1 THEN (SELECT identity_arguments FROM candidate LIMIT 1) END AS identity_arguments,
    CASE WHEN cnt.n = 1 THEN (SELECT return_type FROM candidate LIMIT 1) END AS return_type,
    CASE WHEN cnt.n = 1 THEN (SELECT schema_name FROM candidate LIMIT 1) END AS schema_name,
    CASE WHEN cnt.n = 1 THEN 'PASS' ELSE 'FAIL' END AS validation
FROM cnt;

-- PASS: function_oid, function_name = 'init_user_balance',
--        identity_arguments = '' (zero arguments as expected),
--        return_type = 'void' (or appropriate), schema_name = 'public',
--        validation = 'PASS'

-- 2. Verify init_user_balance() is SECURITY DEFINER and has search_path = public
SELECT
    'FUNCTION: SECURITY DEFINER and search_path' AS check_type,
    proname,
    prosecdef AS is_security_definer,
    -- Check proconfig array for search_path = public (exact match)
    (SELECT bool_or(config_val ~ '^search_path\s*=\s*public$')
     FROM unnest(proconfig) AS config_val
     WHERE config_val ~ '^search_path\s*=\s*public$') AS has_search_path_public
FROM pg_proc
WHERE proname = 'init_user_balance'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- PASS: is_security_definer = true, has_search_path_public = true

-- 3. Verify init_user_balance trigger on public.users with correct bitmask decoding
-- Bit mapping: 1=ROW, 2=BEFORE, 4=INSERT, 8=DELETE, 16=UPDATE, 32=TRUNCATE, 64=INSTEAD
SELECT
    'TRIGGER: init_user_balance on public.users' AS check_type,
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    -- Decode trigger type bits per correct mapping
    CASE WHEN (tgtype & 4) = 4 THEN 'YES' ELSE 'NO' END AS is_insert,
    CASE WHEN (tgtype & 1) = 1 THEN 'YES' ELSE 'NO' END AS is_row,
    CASE WHEN (tgtype & 2) = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
    CASE WHEN (tgtype & 1) = 1 THEN 'ROW' ELSE 'STATEMENT' END AS level,
    CASE WHEN (tgtype & 32) = 32 THEN 'TRUNCATE'
         WHEN (tgtype & 16) = 16 THEN 'UPDATE'
         WHEN (tgtype & 8) = 8 THEN 'DELETE'
         WHEN (tgtype & 4) = 4 THEN 'INSERT'
         WHEN (tgtype & 2) = 2 THEN 'AFTER INSERT'
         ELSE 'UNKNOWN' END AS event,
    tgfoid::regproc AS trigger_function
FROM pg_trigger
WHERE tgname = 'init_user_balance'
  AND tgrelid = 'public.users'::regclass
LIMIT 1;

-- PASS: is_insert = YES, is_row = YES, timing = AFTER, level = ROW,
--        event = INSERT, trigger_function = public.init_user_balance

-- 4. Verify balances.user_id has UNIQUE constraint (from Phase 1 schema)
SELECT
    'CONSTRAINT: balances.user_id uniqueness' AS check_type,
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
  AND tc.table_name = kcu.table_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'balances'
  AND tc.constraint_type = 'UNIQUE'
  AND kcu.column_name = 'user_id'
LIMIT 1;

-- PASS: Returns one row with column_name = 'user_id', constraint_type = 'UNIQUE'

-- 5. Verify Phase 2 RPCs exist with exact signatures from migration
SELECT
    'RPC: Phase 2 functions exact signatures' AS check_type,
    proname AS function_name,
    pg_get_function_identity_arguments(oid) AS identity_arguments,
    pg_get_function_result(oid) AS return_type
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND proname IN ('credit_balance', 'debit_balance', 'revoke_api_key')
  AND oid::regprocedure IN (
    'public.credit_balance(uuid,bigint,uuid,jsonb)'::regprocedure,
    'public.debit_balance(uuid,bigint,uuid,jsonb)'::regprocedure,
    'public.revoke_api_key(uuid,uuid)'::regprocedure
  )
ORDER BY proname;

-- PASS: Returns exactly 3 rows with correct signatures:
-- credit_balance: (uuid,bigint,uuid,jsonb) -> TABLE(new_balance_cents bigint, transaction_id uuid)
-- debit_balance: (uuid,bigint,uuid,jsonb) -> TABLE(new_balance_cents bigint, transaction_id uuid)
-- revoke_api_key: (uuid,uuid) -> boolean

-- 6. Verify Phase 2 RPCs have SECURITY DEFINER and search_path = public
SELECT
    'RPC: SECURITY DEFINER and search_path' AS check_type,
    proname,
    prosecdef AS is_security_definer,
    (SELECT bool_or(config_val ~ '^search_path\s*=\s*public$')
     FROM unnest(proconfig) AS config_val
     WHERE config_val ~ '^search_path\s*=\s*public$') AS has_search_path_public
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND proname IN ('credit_balance', 'debit_balance', 'revoke_api_key')
  AND oid::regprocedure IN (
    'public.credit_balance(uuid,bigint,uuid,jsonb)'::regprocedure,
    'public.debit_balance(uuid,bigint,uuid,jsonb)'::regprocedure,
    'public.revoke_api_key(uuid,uuid)'::regprocedure
  )
ORDER BY proname;

-- PASS: All 3 functions have is_security_definer = true and search_path = public

-- 7. Verify Phase 2 RPC EXECUTE privileges via effective privilege checking
SELECT
    'RPC: effective EXECUTE privileges' AS check_type,
    proname,
    has_function_privilege(p.oid::regprocedure, 'service_role', 'EXECUTE') AS service_role_has_execute,
    -- Determine effective PUBLIC EXECUTE privilege: inspect explicit ACL or default ACL
    (CASE
        WHEN p.proacl IS NOT NULL THEN
            -- Explicit ACL exists: check if PUBLIC (role name 'pg_public' or OID 0) has EXECUTE grant
            (SELECT bool_or(acl_entry.grantee = 0 AND acl_entry.privilege_type = 'x' AND acl_entry.is_grant = true)
             FROM aclexplode(p.proacl) AS acl_entry)
        ELSE
            -- No explicit ACL: use default ACL for functions (object type 'f')
            (SELECT bool_or(acl_entry.grantee = 0 AND acl_entry.privilege_type = 'x' AND acl_entry.is_grant = true)
             FROM aclexplode(acldefault('f', p.proowner)) AS acl_entry)
    END) AS public_has_execute,
    has_function_privilege(p.oid::regprocedure, 'anon', 'EXECUTE') AS anon_has_execute,
    has_function_privilege(p.oid::regprocedure, 'authenticated', 'EXECUTE') AS authenticated_has_execute
FROM pg_proc p
WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND p.proname IN ('credit_balance', 'debit_balance', 'revoke_api_key')
  AND p.oid::regprocedure IN (
    'public.credit_balance(uuid,bigint,uuid,jsonb)'::regprocedure,
    'public.debit_balance(uuid,bigint,uuid,jsonb)'::regprocedure,
    'public.revoke_api_key(uuid,uuid)'::regprocedure
  )
ORDER BY proname;

-- PASS: For each function:
--   service_role_has_execute = true
--   public_has_execute = false
--   anon_has_execute = false
--   authenticated_has_execute = false
-- (Effective privilege checking accounts for explicit ACL, default ACL, and role memberships.)

-- 8. Verify existing RLS policies from the database (inspect, don't assume)
SELECT
    'RLS: actual policies from pg_policies' AS check_type,
    schemaname,
    tablename,
    policyname,
    CASE WHEN permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS policy_type,
    roles,
    cmd AS operation,
    qual AS filter_condition
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'api_keys', 'balances', 'wallet_transactions', 'model_catalog')
ORDER BY tablename, policyname;

-- PASS: Returns policies as stored in the database (verified case-by-case,
-- not hard-coded assumptions). Expected: users_select_own, api_keys_select_own,
-- balances_select_own, wallet_transactions_select_own, model_catalog_select_public

-- 9. Verify no duplicate balance rows exist (read-only)
SELECT
    'DATA: no duplicate balances per user' AS check_type,
    user_id,
    COUNT(*) AS duplicate_count
FROM public.balances
GROUP BY user_id
HAVING COUNT(*) > 1;

-- PASS: Returns zero rows (no user has more than one balance row)

-- 10. Verify users have balance rows where expected (robust to zero users)
SELECT
    'DATA: users with balances (robust to zero users)' AS check_type,
    total_users,
    users_with_balance,
    users_without_balance,
    CASE
        WHEN total_users = 0 THEN 'INFO: No users in database'
        WHEN users_without_balance = 0 THEN 'PASS: All users have balance'
        ELSE 'FAIL: Some users missing balance'
    END AS status
FROM (
    SELECT
        COUNT(DISTINCT u.id) AS total_users,
        COUNT(DISTINCT b.user_id) AS users_with_balance,
        COUNT(DISTINCT u.id) - COUNT(DISTINCT b.user_id) AS users_without_balance
    FROM public.users u
    LEFT JOIN public.balances b ON u.id = b.user_id
) AS user_balance_summary;

-- PASS: If users exist, users_without_balance = 0.
-- If no users exist, report as informational (not a failure).

-- ============================================================
-- END OF VERIFICATION SCRIPT
-- ============================================================