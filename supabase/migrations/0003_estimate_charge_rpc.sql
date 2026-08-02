*** Begin Patch
*** Add File: supabase/migrations/0003_estimate_charge_rpc.sql
+-- RPC to estimate service charge for frontend pre-checks
+-- Returns a numeric charge amount for the given service and amount
+CREATE OR REPLACE FUNCTION public.estimate_service_charge(_service TEXT, _amount NUMERIC)
+RETURNS NUMERIC AS $$
+DECLARE
+  _rec RECORD;
+  _value NUMERIC := 0;
+  _mode TEXT := 'fixed';
+BEGIN
+  SELECT mode, value, is_active INTO _rec FROM public.charge_settings WHERE service = _service LIMIT 1;
+  IF NOT FOUND OR _rec.is_active IS NOT TRUE THEN
+    RETURN 0;
+  END IF;
+  _mode := _rec.mode;
+  _value := (_rec.value)::NUMERIC;
+  IF _value <= 0 THEN
+    RETURN 0;
+  END IF;
+  IF lower(_mode) = 'percent' THEN
+    RETURN ROUND(((_amount * _value) / 100)::NUMERIC, 2);
+  END IF;
+  RETURN _value;
+END;
+$$ LANGUAGE plpgsql SECURITY DEFINER;
+
*** End Patch