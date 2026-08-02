-- =====================================================
-- REFERRAL + CASHBACK SYSTEM
-- =====================================================

-- 1. Add cashback columns to wallets
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS cashback_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_funded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_funded_at timestamptz;

-- 2. Create referral settings table (admin can change values)
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- only one row
  welcome_cashback numeric NOT NULL DEFAULT 100,          -- amount new user gets
  referral_percent numeric NOT NULL DEFAULT 15,           -- % referrer gets
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.referral_settings (id, welcome_cashback, referral_percent)
VALUES (1, 100, 15)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to read/write settings
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read referral settings" ON public.referral_settings;
CREATE POLICY "Anyone can read referral settings"
  ON public.referral_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can update referral settings" ON public.referral_settings;
CREATE POLICY "Admins can update referral settings"
  ON public.referral_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Helper: Check if cashback is unlocked for a user
CREATE OR REPLACE FUNCTION public.is_cashback_unlocked(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS \[ SELECT COALESCE(
    (SELECT has_funded FROM public.wallets WHERE user_id = _user_id),
    false
  ); \];

-- 4. Function to credit cashback
CREATE OR REPLACE FUNCTION public.credit_cashback(
  _user_id uuid,
  _amount numeric,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS \[ BEGIN
  IF _amount <= 0 THEN RETURN; END IF;

  UPDATE public.wallets
  SET cashback_balance = cashback_balance + _amount,
      updated_at = now()
  WHERE user_id = _user_id;

  -- Log it as a transaction for history
  INSERT INTO public.transactions (user_id, type, amount, status, reference, description)
  VALUES (
    _user_id,
    'cashback',
    _amount,
    'success',
    'CB-' || substr(md5(random()::text), 1, 8),
    COALESCE(_reason, 'Cashback credited')
  );
END; \];

-- 5. When a funding is approved → mark has_funded + give referral bonus if first funding
CREATE OR REPLACE FUNCTION public.process_referral_on_first_funding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS \[ DECLARE
  _user_id uuid;
  _amount numeric;
  _referrer_id uuid;
  _settings record;
  _bonus numeric;
  _already_funded boolean;
BEGIN
  -- Only run when funding becomes 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    _user_id := NEW.user_id;
    _amount := NEW.amount;

    -- Check if this is the user's first funding
    SELECT has_funded INTO _already_funded
    FROM public.wallets
    WHERE user_id = _user_id;

    IF NOT COALESCE(_already_funded, false) THEN
      -- Mark as funded (unlocks cashback)
      UPDATE public.wallets
      SET has_funded = true,
          first_funded_at = now(),
          updated_at = now()
      WHERE user_id = _user_id;

      -- Give referral bonus to the referrer (if any)
      SELECT referred_by INTO _referrer_id
      FROM public.profiles
      WHERE id = _user_id;

      IF _referrer_id IS NOT NULL THEN
        SELECT * INTO _settings FROM public.referral_settings WHERE id = 1;

        IF _settings.is_active AND _settings.referral_percent > 0 THEN
          _bonus := ROUND((_amount * _settings.referral_percent / 100.0)::numeric, 2);

          IF _bonus > 0 THEN
            PERFORM public.credit_cashback(
              _referrer_id,
              _bonus,
              'Referral bonus (' || _settings.referral_percent || '%) from first funding'
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; \];

DROP TRIGGER IF EXISTS trg_referral_on_funding ON public.funding_requests;
CREATE TRIGGER trg_referral_on_funding
  AFTER UPDATE ON public.funding_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.process_referral_on_first_funding();

-- 6. Give welcome cashback when a referred user signs up
-- (We will call this from the handle_new_user function later)

GRANT EXECUTE ON FUNCTION public.credit_cashback(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_cashback_unlocked(uuid) TO authenticated, service_role;
