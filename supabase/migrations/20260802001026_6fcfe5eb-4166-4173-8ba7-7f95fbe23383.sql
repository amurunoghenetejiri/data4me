CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
  done boolean := false;
BEGIN
  WHILE NOT done LOOP
    code := 'D4M-';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    PERFORM 1 FROM public.profiles WHERE referral_code = code;
    IF NOT FOUND THEN
      done := true;
    END IF;
  END LOOP;
  RETURN code;
END;
$function$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_funding(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_funding(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_funding(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_available(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pending_funding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_charge(text, numeric) TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

DROP POLICY IF EXISTS "Funding self insert" ON public.funding_requests;
CREATE POLICY "Funding self insert" ON public.funding_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Withdrawals self insert" ON public.withdrawals;
CREATE POLICY "Withdrawals self insert" ON public.withdrawals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Funding admin update" ON public.funding_requests;
CREATE POLICY "Funding admin update" ON public.funding_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Withdrawals admin update" ON public.withdrawals;
CREATE POLICY "Withdrawals admin update" ON public.withdrawals
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));