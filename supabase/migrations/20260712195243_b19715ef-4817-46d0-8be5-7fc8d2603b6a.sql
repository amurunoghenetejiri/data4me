
DROP TABLE IF EXISTS public.smeplug_data_plans CASCADE;
DROP TABLE IF EXISTS public.smeplug_networks CASCADE;
DROP TABLE IF EXISTS public.smeplug_config CASCADE;

UPDATE public.api_providers SET is_active = false WHERE lower(name) LIKE '%smeplug%' OR lower(slug) LIKE '%smeplug%';

INSERT INTO public.api_providers (slug, name, base_url, is_active, environment)
SELECT 'smeapi', 'SMEAPI', 'https://smeapi.com/api', true, 'live'
WHERE NOT EXISTS (SELECT 1 FROM public.api_providers WHERE lower(slug) = 'smeapi');

UPDATE public.api_providers SET is_active = true, base_url = COALESCE(base_url, 'https://smeapi.com/api') WHERE lower(slug) = 'smeapi';
