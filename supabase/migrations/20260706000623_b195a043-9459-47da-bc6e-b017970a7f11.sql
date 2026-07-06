
-- SME Plug provider config
CREATE TABLE public.smeplug_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url text NOT NULL DEFAULT 'https://smeplug.ng/api/v1',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smeplug_config TO authenticated;
GRANT ALL ON public.smeplug_config TO service_role;
ALTER TABLE public.smeplug_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage smeplug_config" ON public.smeplug_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_smeplug_config_updated BEFORE UPDATE ON public.smeplug_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

INSERT INTO public.smeplug_config (base_url, is_active, notes)
VALUES ('https://smeplug.ng/api/v1', true, 'Primary VTU provider');

-- SME Plug networks cache
CREATE TABLE public.smeplug_networks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.smeplug_networks TO authenticated;
GRANT SELECT ON public.smeplug_networks TO anon;
GRANT ALL ON public.smeplug_networks TO service_role;
ALTER TABLE public.smeplug_networks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active networks" ON public.smeplug_networks
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage networks" ON public.smeplug_networks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- SME Plug data plans cache
CREATE TABLE public.smeplug_data_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL UNIQUE,
  network_code text NOT NULL,
  name text NOT NULL,
  size text,
  validity text,
  category text DEFAULT 'monthly',
  cost_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.smeplug_data_plans TO authenticated;
GRANT SELECT ON public.smeplug_data_plans TO anon;
GRANT ALL ON public.smeplug_data_plans TO service_role;
ALTER TABLE public.smeplug_data_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active plans" ON public.smeplug_data_plans
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage plans" ON public.smeplug_data_plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
