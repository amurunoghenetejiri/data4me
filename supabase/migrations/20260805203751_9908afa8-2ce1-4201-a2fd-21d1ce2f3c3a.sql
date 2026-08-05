-- 1. Referral settings ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id integer PRIMARY KEY DEFAULT 1,
  welcome_bonus numeric NOT NULL DEFAULT 100,
  funding_percent numeric NOT NULL DEFAULT 2,
  min_funding_amount numeric NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_settings_single_row CHECK (id = 1)
);

GRANT SELECT ON public.referral_settings TO authenticated, anon;
GRANT INSERT, UPDATE ON public.referral_settings TO authenticated;
GRANT ALL ON public.referral_settings TO service_role;
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral settings readable" ON public.referral_settings;
CREATE POLICY "referral settings readable" ON public.referral_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins update referral settings" ON public.referral_settings;
CREATE POLICY "admins update referral settings" ON public.referral_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins insert referral settings" ON public.referral_settings;
CREATE POLICY "admins insert referral settings" ON public.referral_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.referral_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. Referral rewards -------------------------------------------------------
ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'signup',
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS source_amount numeric,
  ADD COLUMN IF NOT EXISTS beneficiary_id uuid;

ALTER TABLE public.referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_referred_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_signup_unique
  ON public.referral_rewards (referred_id) WHERE kind IN ('signup','welcome');
CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_reference_unique
  ON public.referral_rewards (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS referral_rewards_referrer_idx ON public.referral_rewards (referrer_id, created_at DESC);

DROP POLICY IF EXISTS "referred reads own welcome bonus" ON public.referral_rewards;
CREATE POLICY "referred reads own welcome bonus" ON public.referral_rewards
  FOR SELECT TO authenticated USING (auth.uid() = referred_id);

-- 3. Welcome bonus on signup ------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_referral(_referred_id uuid, _code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code_norm text;
  _referrer public.profiles%ROWTYPE;
  _referred public.profiles%ROWTYPE;
  _s public.referral_settings%ROWTYPE;
  _bonus numeric := 0;
  _ref text;
BEGIN
  IF _referred_id IS NULL THEN
    RAISE EXCEPTION 'referred_id required';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> _referred_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _code_norm := upper(trim(coalesce(_code, '')));
  IF _code_norm = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_code');
  END IF;

  SELECT * INTO _referred FROM public.profiles WHERE id = _referred_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF _referred.referred_by IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_referred');
  END IF;

  SELECT * INTO _referrer FROM public.profiles
   WHERE upper(referral_code) = _code_norm LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  IF _referrer.id = _referred_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  SELECT * INTO _s FROM public.referral_settings WHERE id = 1;
  IF NOT FOUND OR NOT _s.is_active THEN
    UPDATE public.profiles SET referred_by = _referrer.id
     WHERE id = _referred_id AND referred_by IS NULL;
    RETURN jsonb_build_object('ok', true, 'bonus', 0, 'referrer_id', _referrer.id);
  END IF;

  _bonus := coalesce(_s.welcome_bonus, 0);

  UPDATE public.profiles SET referred_by = _referrer.id
   WHERE id = _referred_id AND referred_by IS NULL;

  BEGIN
    INSERT INTO public.referral_rewards (referrer_id, referred_id, beneficiary_id, amount, status, kind, reference)
    VALUES (_referrer.id, _referred_id, _referred_id, _bonus, 'credited', 'welcome',
            'REFW-' || substr(md5(_referred_id::text), 1, 12));
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'already_rewarded', true, 'referrer_id', _referrer.id);
  END;

  IF _bonus > 0 THEN
    INSERT INTO public.wallets (user_id, balance) VALUES (_referred_id, 0)
      ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.wallets SET balance = balance + _bonus, updated_at = now()
     WHERE user_id = _referred_id;

    _ref := 'REFW-' || substr(md5(random()::text), 1, 8);
    INSERT INTO public.transactions (user_id, type, amount, status, reference, description, charge)
    VALUES (_referred_id, 'referral', _bonus, 'success', _ref,
            'Welcome bonus for joining with a referral link', 0);

    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (_referred_id, 'Welcome bonus credited',
            'You received a welcome bonus of ' || _bonus::text || ' for joining with a referral link.', 'referral');

    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (_referrer.id, 'New referral joined',
            '@' || coalesce(_referred.username, 'a friend') ||
            ' joined with your link. You now earn a commission on every wallet funding they make.', 'referral');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'bonus', _bonus,
    'referrer_id', _referrer.id,
    'referrer_username', coalesce(_referrer.username, ''),
    'referred_username', coalesce(_referred.username, ''),
    'reference', _ref
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_referral(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral(uuid, text) TO authenticated;

-- 4. Commission on every successful wallet funding --------------------------
CREATE OR REPLACE FUNCTION public.tg_referral_funding_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.referral_settings%ROWTYPE;
  _referrer uuid;
  _amt numeric;
  _r text;
  _uname text;
BEGIN
  IF NEW.type <> 'wallet' OR NEW.status <> 'success' OR coalesce(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  IF coalesce(NEW.reference, '') LIKE 'REF%' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _s FROM public.referral_settings WHERE id = 1;
  IF NOT FOUND OR NOT _s.is_active OR coalesce(_s.funding_percent, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.amount < coalesce(_s.min_funding_amount, 0) THEN
    RETURN NEW;
  END IF;

  SELECT referred_by INTO _referrer FROM public.profiles WHERE id = NEW.user_id;
  IF _referrer IS NULL OR _referrer = NEW.user_id THEN
    RETURN NEW;
  END IF;

  _amt := round(NEW.amount * _s.funding_percent / 100.0, 2);
  IF _amt <= 0 THEN RETURN NEW; END IF;

  _r := 'REFC-' || NEW.id::text;

  BEGIN
    INSERT INTO public.referral_rewards
      (referrer_id, referred_id, beneficiary_id, amount, status, kind, reference, source_amount)
    VALUES (_referrer, NEW.user_id, _referrer, _amt, 'credited', 'funding', _r, NEW.amount);
  EXCEPTION WHEN unique_violation THEN
    RETURN NEW;
  END;

  INSERT INTO public.wallets (user_id, balance) VALUES (_referrer, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance = balance + _amt, updated_at = now()
   WHERE user_id = _referrer;

  SELECT username INTO _uname FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.transactions (user_id, type, amount, status, reference, description, charge)
  VALUES (_referrer, 'referral', _amt, 'success', _r,
          'Referral commission from @' || coalesce(_uname, 'a friend') || ' wallet funding', 0);

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (_referrer, 'Referral commission earned',
          'You earned ' || _amt::text || ' from @' || coalesce(_uname, 'a friend') || '''s wallet funding.',
          'referral');

  INSERT INTO public.audit_logs (action, target_type, target_id, details)
  VALUES ('referral_commission', 'referral_reward', _r,
          jsonb_build_object('referrer_id', _referrer, 'referred_id', NEW.user_id,
                             'amount', _amt, 'percent', _s.funding_percent, 'funding_amount', NEW.amount));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_funding_commission ON public.transactions;
CREATE TRIGGER trg_referral_funding_commission
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_referral_funding_commission();

-- 5. Push devices + delivery tracking ---------------------------------------
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

DROP POLICY IF EXISTS "Admins manage push tokens" ON public.push_tokens;
CREATE POLICY "Admins manage push tokens" ON public.push_tokens
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid,
  user_id uuid NOT NULL,
  token text,
  title text,
  body text,
  type text,
  action_url text,
  status text NOT NULL DEFAULT 'sent',
  attempts integer NOT NULL DEFAULT 1,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.push_deliveries TO authenticated;
GRANT ALL ON public.push_deliveries TO service_role;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own deliveries" ON public.push_deliveries;
CREATE POLICY "users read own deliveries" ON public.push_deliveries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS push_deliveries_user_idx ON public.push_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS push_deliveries_notification_idx ON public.push_deliveries (notification_id);

-- 6. Scheduled notifications -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'promotion',
  action_url text,
  image text,
  user_ids uuid[],
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  sent_at timestamptz,
  result jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_notifications TO authenticated;
GRANT ALL ON public.scheduled_notifications TO service_role;
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage scheduled notifications" ON public.scheduled_notifications;
CREATE POLICY "admins manage scheduled notifications" ON public.scheduled_notifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS scheduled_notifications_due_idx
  ON public.scheduled_notifications (send_at) WHERE status = 'scheduled';