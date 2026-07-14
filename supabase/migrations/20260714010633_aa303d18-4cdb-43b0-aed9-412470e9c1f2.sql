
-- 1) admin_bank_accounts: remove public SELECT, restrict to authenticated
DROP POLICY IF EXISTS "admin banks readable by all" ON public.admin_bank_accounts;
CREATE POLICY "admin banks readable by authenticated"
  ON public.admin_bank_accounts FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.admin_bank_accounts FROM anon;

-- 2) app_settings: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Settings read all" ON public.app_settings;
CREATE POLICY "Settings read authenticated"
  ON public.app_settings FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.app_settings FROM anon;

-- 3) contact_messages: replace WITH CHECK (true) with basic validation
DROP POLICY IF EXISTS "Contact anyone insert" ON public.contact_messages;
CREATE POLICY "Contact anyone insert"
  ON public.contact_messages FOR INSERT TO anon, authenticated
  WITH CHECK (
    message IS NOT NULL AND length(btrim(message)) > 0
    AND (email IS NOT NULL OR name IS NOT NULL)
  );

-- 4) SECURITY DEFINER functions: revoke broad EXECUTE, grant only where needed
-- Trigger functions: revoke from PUBLIC entirely (triggers run as table owner)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_log_contact() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_log_funding() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_log_profile_signup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_log_transaction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_activity_funding() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_activity_login() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_activity_tx() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_data_plan_change() FROM PUBLIC, anon, authenticated;

-- Internal helpers (only called by other SECURITY DEFINER funcs or server): revoke from all client roles
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Client-callable RPCs: revoke from PUBLIC + anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_pending_funding(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_charge(text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_activity(text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_funding(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_funding(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_funding(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_withdrawal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_withdrawal(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_status(uuid, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_transaction(uuid, text) FROM PUBLIC, anon;
