CREATE TABLE IF NOT EXISTS public.ai_settings (
  key text PRIMARY KEY,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_settings TO anon;
GRANT SELECT ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_settings readable by everyone"
ON public.ai_settings FOR SELECT USING (true);

CREATE POLICY "ai_settings admin manage"
ON public.ai_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ai_settings_touch
BEFORE UPDATE ON public.ai_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.ai_settings (key, label, enabled, description) VALUES
  ('user_actions', 'User actions', true, 'Allow D4 AI to execute purchases, transfers and funding requests for users'),
  ('admin_actions', 'Admin actions', false, 'Allow D4 AI to execute admin operations (wallet adjust, approvals, refunds, pricing)'),
  ('receipt_review', 'AI receipt review', false, 'Allow D4 AI to analyse funding receipts for fraud and duplicates'),
  ('bulk_actions', 'Bulk admin actions', false, 'Allow D4 AI to run bulk operations (bulk price update, bulk credit, broadcasts)'),
  ('require_confirmation', 'Confirm sensitive actions', true, 'Require explicit user confirmation before high-impact actions'),
  ('notifications', 'AI notifications', true, 'Allow D4 AI to generate and send notifications')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_email text,
  is_admin boolean NOT NULL DEFAULT false,
  tool text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_action_logs TO authenticated;
GRANT ALL ON public.ai_action_logs TO service_role;

ALTER TABLE public.ai_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai logs own"
ON public.ai_action_logs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "ai logs admin"
ON public.ai_action_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user_created
ON public.ai_action_logs (user_id, created_at DESC);