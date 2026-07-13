// DATA4ME SMEAPI proxy edge function — the single VTU provider
// Actions: status | balance | dataplans | buy-data | buy-airtime |
//          cabletv-verify | cabletv-buy | electricity-verify | electricity-buy |
//          waec | sync-plans
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const BASE = Deno.env.get('SMEAPI_BASE_URL') || 'https://smeapi.com.ng/api';
const USERNAME = Deno.env.get('SMEAPI_USERNAME') || '';
const API_KEY = Deno.env.get('SMEAPI_API_KEY') || '';
const PIN = Deno.env.get('SMEAPI_PIN') || '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
    'x-api-key': API_KEY,
    'x-username': USERNAME,
  } as Record<string, string>;
}

async function call(path: string, init?: RequestInit) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, body: json, latency_ms: Date.now() - started };
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!API_KEY || !USERNAME) {
      return json({ error: 'SMEAPI credentials not configured', configured: false }, 500);
    }

    const url = new URL(req.url);
    let payload: any = {};
    if (req.method === 'POST') { try { payload = await req.json(); } catch { payload = {}; } }
    const action = url.searchParams.get('action') || payload?.action;

    let result;
    switch (action) {
      case 'status': {
        // Ping the provider using the balance endpoint and return a compact health payload
        const r = await call('/user', { method: 'GET' });
        const balance = Number(r.body?.balance ?? r.body?.data?.balance ?? r.body?.user?.balance ?? 0);
        return json({
          provider: 'smeapi',
          base_url: BASE,
          reachable: r.ok,
          status: r.status,
          latency_ms: r.latency_ms,
          balance,
          raw: r.body,
        }, 200);
      }
      case 'balance':
        result = await call('/user', { method: 'GET' });
        break;
      case 'dataplans':
        result = await call('/dataplans', { method: 'GET' });
        break;
      case 'sync-plans': {
        // Pull plans from SMEAPI and upsert into public.data_plans
        const r = await call('/dataplans', { method: 'GET' });
        if (!r.ok) return json({ success: false, error: 'Failed to fetch plans', raw: r.body }, r.status);
        const svc = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        // Normalise: expected shape { MTN_PLAN: [...], GLO_PLAN: [...], ... } or { data: {...} }
        const src = r.body?.data ?? r.body ?? {};
        const groups: Record<string, any[]> = {};
        for (const [k, v] of Object.entries(src)) {
          if (!Array.isArray(v)) continue;
          const net = k.toUpperCase().replace(/[^A-Z0-9]/g, '').replace('PLAN', '').replace('DATA', '');
          const netId = net.includes('MTN') ? 'MTN'
            : net.includes('GLO') ? 'GLO'
            : net.includes('AIRTEL') ? 'AIRTEL'
            : net.includes('9MOBILE') || net.includes('ETISALAT') ? '9MOBILE'
            : null;
          if (!netId) continue;
          groups[netId] = v;
        }
        let inserted = 0, updated = 0, skipped = 0;
        for (const [network, plans] of Object.entries(groups)) {
          for (const p of plans) {
            const api_code = String(p.plan_id ?? p.id ?? p.dataplan_id ?? '');
            if (!api_code) { skipped++; continue; }
            const data_size = String(p.plan ?? p.name ?? p.size ?? p.data ?? '');
            const cost_price = Number(p.plan_amount ?? p.amount ?? p.price ?? 0);
            const validity = String(p.month_validate ?? p.validity ?? p.duration ?? '');
            const plan_type = String(p.plan_type ?? p.type ?? 'SME');

            // Try update first by (network, api_code); else insert
            const { data: existing } = await svc
              .from('data_plans')
              .select('id, selling_price')
              .eq('network', network)
              .eq('api_code', api_code)
              .maybeSingle();

            if (existing) {
              await svc.from('data_plans').update({
                data_size, validity, plan_type, cost_price, is_active: true,
              }).eq('id', existing.id);
              updated++;
            } else {
              const selling_price = Math.round(cost_price * 1.1); // default 10% markup
              await svc.from('data_plans').insert({
                network, api_code, data_size, validity, plan_type,
                cost_price, selling_price, is_active: true, provider: 'smeapi',
              });
              inserted++;
            }
          }
        }
        return json({ success: true, inserted, updated, skipped, groups: Object.keys(groups) });
      }
      case 'buy-data':
        result = await call('/data', {
          method: 'POST',
          body: JSON.stringify({
            network: payload.network,
            mobile_number: payload.phone,
            plan: payload.plan_id,
            Ported_number: true,
            pin: PIN,
          }),
        });
        break;
      case 'buy-airtime':
        result = await call('/airtime', {
          method: 'POST',
          body: JSON.stringify({
            network: payload.network,
            amount: payload.amount,
            mobile_number: payload.phone,
            Ported_number: true,
            airtime_type: 'VTU',
            pin: PIN,
          }),
        });
        break;
      case 'cabletv-verify':
        result = await call('/cabletv/verify', {
          method: 'POST',
          body: JSON.stringify({ cablename: payload.provider, smart_card_number: payload.smart_card_number }),
        });
        break;
      case 'cabletv-buy':
        result = await call('/cablesub', {
          method: 'POST',
          body: JSON.stringify({
            cablename: payload.provider,
            cableplan: payload.plan,
            smart_card_number: payload.smart_card_number,
            pin: PIN,
          }),
        });
        break;
      case 'electricity-verify':
        result = await call('/electricity/verify', {
          method: 'POST',
          body: JSON.stringify({ disco_name: payload.disco, meter_number: payload.meter_number, MeterType: payload.meter_type || 'PREPAID' }),
        });
        break;
      case 'electricity-buy':
        result = await call('/billpayment', {
          method: 'POST',
          body: JSON.stringify({
            disco_name: payload.disco,
            meter_number: payload.meter_number,
            MeterType: payload.meter_type || 'PREPAID',
            amount: payload.amount,
            pin: PIN,
          }),
        });
        break;
      case 'waec':
        result = await call('/epin', {
          method: 'POST',
          body: JSON.stringify({ exam_name: payload.exam || 'WAEC', quantity: payload.quantity || 1, pin: PIN }),
        });
        break;
      default:
        return json({ error: 'Unknown action', action }, 400);
    }

    return json(result.body, result.status);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
