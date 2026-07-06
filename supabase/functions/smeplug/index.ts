// DATA4ME — SME Plug provider proxy (admin/utility endpoints)
// Actions:
//   balance          -> GET /user            (SME Plug wallet balance)
//   networks         -> GET /networks        (dynamic list)
//   dataplans        -> GET /data/plans      (dynamic list)
//   sync-plans       -> pulls networks + plans and upserts into public.smeplug_*
//                       and public.data_plans (so the existing UI works unchanged).
//   tx-status        -> GET /transaction/{reference}
//   verify-meter     -> POST /networks/electric/verify
//   verify-smartcard -> POST /networks/tv/verify
//   discos           -> GET  /networks/electric/discos
//   cable-packages   -> GET  /networks/tv/packages
//
// All requests are authenticated. `sync-plans` requires an admin caller.
// The SME Plug API key is read from the SMEPLUG_API_KEY secret and never returned to the client.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const ok = (data: any, status = 200) =>
  new Response(JSON.stringify({ success: true, ...data }), { status, headers: jsonHeaders });
const fail = (error: string, status = 400, extra: any = {}) =>
  new Response(JSON.stringify({ success: false, error, ...extra }), { status, headers: jsonHeaders });

async function getBaseUrl(svc: any): Promise<string> {
  const { data } = await svc
    .from('smeplug_config')
    .select('base_url,is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.base_url as string) || Deno.env.get('SMEPLUG_BASE_URL') || 'https://smeplug.ng/api/v1';
}

async function smeplugCall(baseUrl: string, apiKey: string, path: string, init: RequestInit = {}) {
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
    const raw = await res.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = { raw }; }
    console.log(`[SMEPLUG] ${init.method || 'GET'} ${path} -> ${res.status}`);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    console.error(`[SMEPLUG] ${path} network error`, err);
    return { ok: false, status: 0, body: { error: (err as Error).message } };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('SMEPLUG_API_KEY') || '';
  if (!apiKey) return fail('SMEPLUG_API_KEY is not configured', 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const svc = createClient(supabaseUrl, serviceKey);

  // Auth
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return fail('Authentication required', 401);
  const { data: userData, error: authErr } = await svc.auth.getUser(token);
  if (authErr || !userData?.user?.id) return fail('Invalid session', 401);
  const userId = userData.user.id;

  const { data: roleRow } = await svc
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  const isAdmin = !!roleRow;

  let payload: any = {};
  if (req.method === 'POST') { try { payload = await req.json(); } catch { payload = {}; } }
  const url = new URL(req.url);
  const action = payload.action || url.searchParams.get('action');
  if (!action) return fail('action is required', 400);

  const adminOnly = ['balance', 'sync-plans'];
  if (adminOnly.includes(action) && !isAdmin) return fail('Admin access required', 403);

  const base = await getBaseUrl(svc);

  try {
    switch (action) {
      case 'balance': {
        const r = await smeplugCall(base, apiKey, '/user', { method: 'GET' });
        if (!r.ok) return fail(r.body?.msg || 'Failed to fetch balance', r.status || 502, { provider: r.body });
        // SME Plug returns { status, user: { balance, ... } } or similar
        const bal = r.body?.user?.balance ?? r.body?.balance ?? r.body?.data?.balance ?? null;
        return ok({ balance: bal, provider: r.body });
      }
      case 'networks': {
        const r = await smeplugCall(base, apiKey, '/networks', { method: 'GET' });
        return ok({ networks: r.body?.networks ?? r.body?.data ?? r.body, status: r.status });
      }
      case 'dataplans': {
        const r = await smeplugCall(base, apiKey, '/data/plans', { method: 'GET' });
        return ok({ plans: r.body?.plans ?? r.body?.data ?? r.body, status: r.status });
      }
      case 'discos': {
        const r = await smeplugCall(base, apiKey, '/networks/electric/discos', { method: 'GET' });
        return ok({ discos: r.body?.discos ?? r.body?.data ?? r.body });
      }
      case 'cable-packages': {
        const r = await smeplugCall(base, apiKey, '/networks/tv/packages', { method: 'GET' });
        return ok({ packages: r.body?.packages ?? r.body?.data ?? r.body });
      }
      case 'verify-meter': {
        const r = await smeplugCall(base, apiKey, '/networks/electric/verify', {
          method: 'POST',
          body: JSON.stringify({
            disco_name: payload.disco,
            meter_number: payload.meter_number,
            meter_type: payload.meter_type || 'PREPAID',
          }),
        });
        return ok({ result: r.body, status: r.status });
      }
      case 'verify-smartcard': {
        const r = await smeplugCall(base, apiKey, '/networks/tv/verify', {
          method: 'POST',
          body: JSON.stringify({
            cable_name: payload.provider,
            smart_card_number: payload.smart_card_number,
          }),
        });
        return ok({ result: r.body, status: r.status });
      }
      case 'tx-status': {
        const ref = payload.reference || url.searchParams.get('reference');
        if (!ref) return fail('reference is required', 400);
        const r = await smeplugCall(base, apiKey, `/transaction/${encodeURIComponent(ref)}`, { method: 'GET' });
        return ok({ result: r.body, status: r.status });
      }
      case 'sync-plans': {
        // Fetch networks + plans, upsert into smeplug_* and mirror into data_plans.
        const netRes = await smeplugCall(base, apiKey, '/networks', { method: 'GET' });
        const planRes = await smeplugCall(base, apiKey, '/data/plans', { method: 'GET' });
        if (!netRes.ok || !planRes.ok) {
          return fail('Failed to fetch data from SME Plug', 502, { netRes: netRes.body, planRes: planRes.body });
        }
        const rawNetworks: any[] = netRes.body?.networks ?? netRes.body?.data ?? [];
        const rawPlans: any = planRes.body?.plans ?? planRes.body?.data ?? planRes.body;

        // Networks (SME Plug returns [{id, name}])
        const netUpserts = (Array.isArray(rawNetworks) ? rawNetworks : []).map((n: any) => ({
          code: String(n.id ?? n.code ?? n.network_id ?? n.name).trim(),
          name: String(n.name ?? n.network ?? '').trim() || String(n.id),
          is_active: true,
          synced_at: new Date().toISOString(),
        }));
        if (netUpserts.length) {
          await svc.from('smeplug_networks').upsert(netUpserts, { onConflict: 'code' });
        }

        // Plans: SME Plug returns { plans: { MTN: [ {id, plan, plan_type, duration, price} ], AIRTEL: [...] } }
        // or a flat array. Handle both.
        const planRows: any[] = [];
        const pushPlan = (netName: string, p: any) => {
          const cost = Number(p.price ?? p.amount ?? p.cost ?? 0);
          // Add 3% default retail margin if selling_price not defined by admin.
          const selling = Math.round(cost * 1.03);
          const netCode = String(p.network_id ?? netName).toUpperCase();
          planRows.push({
            plan_id: String(p.id ?? p.plan_id ?? p.code),
            network_code: netCode,
            name: String(p.plan ?? p.name ?? `${p.plan_type || ''} ${p.duration || ''}`).trim(),
            size: String(p.plan ?? p.size ?? p.data_size ?? ''),
            validity: String(p.duration ?? p.validity ?? ''),
            category: (p.plan_type || 'monthly').toString().toLowerCase().includes('day') ? 'daily'
                    : (p.plan_type || 'monthly').toString().toLowerCase().includes('week') ? 'weekly'
                    : 'monthly',
            cost_price: cost,
            selling_price: selling,
            is_active: true,
            synced_at: new Date().toISOString(),
          });
        };
        if (Array.isArray(rawPlans)) {
          rawPlans.forEach((p: any) => pushPlan(p.network || p.network_name || 'UNKNOWN', p));
        } else if (rawPlans && typeof rawPlans === 'object') {
          for (const [netName, arr] of Object.entries(rawPlans)) {
            (arr as any[]).forEach((p) => pushPlan(netName, p));
          }
        }
        if (planRows.length) {
          await svc.from('smeplug_data_plans').upsert(planRows, { onConflict: 'plan_id' });

          // Mirror into data_plans (existing consumer UI) — only insert new ones,
          // preserving admin selling_price edits on existing rows.
          for (const p of planRows) {
            const { data: existing } = await svc
              .from('data_plans').select('id').eq('api_code', p.plan_id).maybeSingle();
            if (existing) {
              await svc.from('data_plans').update({
                network: p.network_code,
                data_size: p.size,
                duration: p.validity,
                cost_price: p.cost_price,
                is_active: true,
                updated_at: new Date().toISOString(),
              }).eq('id', existing.id);
            } else {
              await svc.from('data_plans').insert({
                network: p.network_code,
                plan_name: p.name,
                data_size: p.size,
                duration: p.validity,
                validity: p.validity,
                category: p.category,
                cost_price: p.cost_price,
                selling_price: p.selling_price,
                api_code: p.plan_id,
                is_active: true,
              });
            }
          }
        }
        return ok({
          networks_synced: netUpserts.length,
          plans_synced: planRows.length,
        });
      }
      default:
        return fail(`Unknown action: ${action}`, 400);
    }
  } catch (err) {
    console.error('[SMEPLUG] handler exception', err);
    return fail((err as Error).message || 'Unexpected error', 500);
  }
});
