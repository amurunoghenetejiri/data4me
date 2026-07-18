
CREATE TABLE IF NOT EXISTS public.telegram_message_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funding_id uuid NOT NULL REFERENCES public.funding_requests(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  message_id bigint NOT NULL,
  kind text NOT NULL DEFAULT 'photo',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chat_id, message_id)
);
GRANT ALL ON public.telegram_message_refs TO service_role;
ALTER TABLE public.telegram_message_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc only refs" ON public.telegram_message_refs FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_tg_msg_refs_funding ON public.telegram_message_refs(funding_id);

-- Process funding action initiated from Telegram (admin identity is a Telegram user id string).
CREATE OR REPLACE FUNCTION public.tg_process_funding(
  _id uuid,
  _action text,
  _telegram_admin text,
  _telegram_admin_name text DEFAULT NULL,
  _remark text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f public.funding_requests;
  _admin_label text;
BEGIN
  IF _action NOT IN ('approve','reject','cancel') THEN
    RAISE EXCEPTION 'Invalid action %', _action;
  END IF;

  SELECT * INTO _f FROM public.funding_requests WHERE id = _id FOR UPDATE;
  IF _f IS NULL THEN RAISE EXCEPTION 'Funding request not found'; END IF;

  -- Idempotency: if already acted on, return current state without changes.
  IF _f.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'already_processed', true,
      'status', _f.status,
      'admin_remark', _f.admin_remark,
      'reviewed_at', _f.reviewed_at
    );
  END IF;

  _admin_label := COALESCE(_telegram_admin_name, 'Telegram Admin') || ' (' || _telegram_admin || ')';

  IF _action = 'approve' THEN
    UPDATE public.funding_requests
      SET status='approved',
          admin_remark = COALESCE(_remark, 'Approved via Telegram by '||_admin_label),
          reviewed_at = now()
      WHERE id = _id;
    UPDATE public.wallets SET balance = balance + _f.amount, updated_at=now() WHERE user_id = _f.user_id;
    INSERT INTO public.transactions(user_id,type,amount,status,reference,description)
    VALUES (_f.user_id,'wallet',_f.amount,'success',
            COALESCE(_f.reference,'FR-'||substr(md5(random()::text),1,8)),
            'Funding approved via Telegram — '||_admin_label);
    INSERT INTO public.notifications(user_id,title,body)
    VALUES (_f.user_id,'✅ Funding approved',
            '₦'||_f.amount::text||' has been added to your wallet.');
  ELSIF _action = 'reject' THEN
    UPDATE public.funding_requests
      SET status='rejected',
          admin_remark = COALESCE(_remark, 'Rejected via Telegram by '||_admin_label),
          reviewed_at = now()
      WHERE id = _id;
    INSERT INTO public.notifications(user_id,title,body)
    VALUES (_f.user_id,'❌ Funding rejected', COALESCE(_remark,'Your funding request was rejected.'));
  ELSE -- cancel
    UPDATE public.funding_requests
      SET status='cancelled',
          admin_remark = COALESCE(_remark, 'Cancelled via Telegram by '||_admin_label),
          reviewed_at = now()
      WHERE id = _id;
    INSERT INTO public.notifications(user_id,title,body)
    VALUES (_f.user_id,'🚫 Funding cancelled', COALESCE(_remark,'Your funding request was cancelled.'));
  END IF;

  INSERT INTO public.audit_logs (admin_id, admin_email, action, target_type, target_id, details)
  VALUES (NULL, 'telegram:'||_telegram_admin, 'funding_'||_action||'_telegram', 'funding', _id::text,
          jsonb_build_object('amount',_f.amount,'admin',_admin_label,'remark',_remark));

  RETURN jsonb_build_object('already_processed', false, 'status',
    CASE _action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'cancelled' END,
    'admin_label', _admin_label
  );
END;$$;

REVOKE ALL ON FUNCTION public.tg_process_funding(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_process_funding(uuid,text,text,text,text) TO service_role;

-- Info bundle for Telegram messages
CREATE OR REPLACE FUNCTION public.tg_get_funding_info(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f public.funding_requests;
  _p record;
  _bal numeric;
BEGIN
  SELECT * INTO _f FROM public.funding_requests WHERE id=_id;
  IF _f IS NULL THEN RETURN NULL; END IF;
  SELECT full_name, username, email, phone INTO _p FROM public.profiles WHERE id = _f.user_id;
  SELECT balance INTO _bal FROM public.wallets WHERE user_id = _f.user_id;
  RETURN jsonb_build_object(
    'id', _f.id,
    'user_id', _f.user_id,
    'amount', _f.amount,
    'reference', _f.reference,
    'provider', _f.provider,
    'bank', _f.bank,
    'status', _f.status,
    'created_at', _f.created_at,
    'receipt_url', _f.receipt_url,
    'admin_remark', _f.admin_remark,
    'reviewed_at', _f.reviewed_at,
    'full_name', _p.full_name,
    'username', _p.username,
    'email', _p.email,
    'phone', _p.phone,
    'wallet_balance', COALESCE(_bal,0)
  );
END;$$;

REVOKE ALL ON FUNCTION public.tg_get_funding_info(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_get_funding_info(uuid) TO service_role;
