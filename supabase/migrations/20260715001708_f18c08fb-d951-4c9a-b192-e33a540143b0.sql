
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'smeapi';
UPDATE public.data_plans SET provider = COALESCE(NULLIF(supplier,''), 'smeapi') WHERE provider = 'smeapi';

ALTER TABLE public.data_plans DROP CONSTRAINT IF EXISTS data_plans_network_plan_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS data_plans_provider_plan_id_key ON public.data_plans(provider, plan_id);

CREATE TABLE IF NOT EXISTS public.wallet_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','committed','released')),
  purpose text,
  reference text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_holds_user_active ON public.wallet_holds(user_id) WHERE status='active';

GRANT SELECT ON public.wallet_holds TO authenticated;
GRANT ALL ON public.wallet_holds TO service_role;
ALTER TABLE public.wallet_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own holds" ON public.wallet_holds;
CREATE POLICY "Users read own holds" ON public.wallet_holds FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.wallet_available(_user_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT COALESCE((SELECT balance FROM public.wallets WHERE user_id=_user_id),0)
       - COALESCE((SELECT SUM(amount) FROM public.wallet_holds WHERE user_id=_user_id AND status='active'),0);
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_available(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_available(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_wallet_hold(_user_id uuid, _amount numeric, _purpose text, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _avail numeric; _id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid hold amount'; END IF;
  PERFORM 1 FROM public.wallets WHERE user_id=_user_id FOR UPDATE;
  SELECT public.wallet_available(_user_id) INTO _avail;
  IF _avail < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  INSERT INTO public.wallet_holds(user_id, amount, purpose, meta) VALUES (_user_id,_amount,_purpose,COALESCE(_meta,'{}'::jsonb)) RETURNING id INTO _id;
  RETURN _id;
END;$$;
REVOKE EXECUTE ON FUNCTION public.create_wallet_hold(uuid,numeric,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_wallet_hold(uuid,numeric,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.release_wallet_hold(_hold_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  UPDATE public.wallet_holds
    SET status='released',
        meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('released_reason',_reason,'released_at',now()),
        updated_at=now()
   WHERE id=_hold_id AND status='active';
END;$$;
REVOKE EXECUTE ON FUNCTION public.release_wallet_hold(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_wallet_hold(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_wallet_hold(_hold_id uuid, _type text, _description text, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _h public.wallet_holds; _tx public.transactions; _bal numeric;
BEGIN
  SELECT * INTO _h FROM public.wallet_holds WHERE id=_hold_id AND status='active' FOR UPDATE;
  IF _h IS NULL THEN RAISE EXCEPTION 'Hold not found or not active'; END IF;
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=_h.user_id FOR UPDATE;
  IF _bal < _h.amount THEN
    UPDATE public.wallet_holds SET status='released', updated_at=now() WHERE id=_hold_id;
    RAISE EXCEPTION 'Insufficient balance at commit';
  END IF;
  UPDATE public.wallets SET balance = balance - _h.amount, updated_at=now() WHERE user_id=_h.user_id;
  UPDATE public.wallet_holds SET status='committed', updated_at=now() WHERE id=_hold_id;
  INSERT INTO public.transactions(user_id,type,amount,status,reference,description,meta)
  VALUES (_h.user_id,_type,_h.amount,'success','D4M-'||substr(md5(random()::text),1,10),_description,
          COALESCE(_meta,'{}'::jsonb) || jsonb_build_object('hold_id',_hold_id))
  RETURNING * INTO _tx;
  INSERT INTO public.notifications(user_id,title,body) VALUES (_h.user_id,'Purchase successful',_description);
  RETURN _tx;
END;$$;
REVOKE EXECUTE ON FUNCTION public.commit_wallet_hold(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_wallet_hold(uuid,text,text,jsonb) TO service_role;

INSERT INTO public.api_providers(slug, name, is_active)
SELECT 'smeapi','SME API',true WHERE NOT EXISTS (SELECT 1 FROM public.api_providers WHERE slug='smeapi');
INSERT INTO public.api_providers(slug, name, is_active)
SELECT 'smeplug','SMEPlug',true WHERE NOT EXISTS (SELECT 1 FROM public.api_providers WHERE slug='smeplug');
