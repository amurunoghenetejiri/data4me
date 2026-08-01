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

  PERFORM net.http_post(
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

REVOKE EXECUTE ON FUNCTION public.tg_dispatch_push() FROM anon, authenticated;