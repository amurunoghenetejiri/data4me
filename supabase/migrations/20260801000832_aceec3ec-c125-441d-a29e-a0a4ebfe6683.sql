CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications (user_id) WHERE read = false;

ALTER TABLE public.notification_settings ALTER COLUMN email SET DEFAULT false;
ALTER TABLE public.notification_settings ALTER COLUMN whatsapp SET DEFAULT false;

-- auto-create default notification settings on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, username, email, phone, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    public.generate_referral_code()
  );
  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 0);
  INSERT INTO public.notification_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF LOWER(NEW.email) IN ('amurundestiny@gmail.com', 'amurundestin@gmail.com', 'admin@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- dispatch web push whenever a user-targeted notification row is created
CREATE OR REPLACE FUNCTION public.tg_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _secret text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO _secret FROM public.secure_secrets WHERE name = 'PUSH_DISPATCH_SECRET';
  IF _secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.net.http_post(
    url := 'https://fldgnfhkrqaxlytcqlov.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', _secret
    ),
    body := jsonb_build_object(
      'internal', true,
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', COALESCE(NEW.body, NEW.message, ''),
      'type', COALESCE(NEW.type, 'system'),
      'action_url', COALESCE(NEW.action_url, '/notifications'),
      'icon', NEW.icon,
      'image', NEW.image
    ),
    timeout_milliseconds := 3000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_dispatch_push ON public.notifications;
CREATE TRIGGER trg_dispatch_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_dispatch_push();

REVOKE EXECUTE ON FUNCTION public.tg_dispatch_push() FROM anon, authenticated;