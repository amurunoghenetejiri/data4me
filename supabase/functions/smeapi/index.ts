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

const NETWORK_ID_MAP: Record<string, number> = { MTN: 1, GLO: 2, '9MOBILE': 3, AIRTEL: 4 };
function toNetworkId(n: any): number | null {
  if (typeof n === 'number') return n;
  const k = String(n || '').toUpperCase().trim();
  return NETWORK_ID_MAP[k] ?? null;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Token ${API_KEY}`,
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
        // Pull plans from SMEAPI and mirror them into public.data_plans
        const r = await call('/dataplans/', { method: 'GET' });
        if (!r.ok) return json({ success: false, error: 'Failed to fetch plans', status: r.status, raw: r.body }, r.status);
        const list: any[] = Array.isArray(r.body?.data) ? r.body.data
          : Array.isArray(r.body?.plans) ? r.body.plans
          : Array.isArray(r.body) ? r.body : [];
        console.log(`[sync-plans] received ${list.length} plans from SMEAPI`);
        if (!list.length) return json({ success: false, error: 'SMEAPI returned no plans', raw: r.body }, 200);

        const svc = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const NET_MAP: Record<string, string> = {
          MTN: 'mtn', GLO: 'glo', AIRTEL: 'airtel',
          '9MOBILE': '9mobile', ETISALAT: '9mobile',
        };

        let imported = 0, updated = 0, removed = 0, skipped = 0;
        const seen = new Set<string>();

        for (const p of list) {
          const netKey = String(p.network || '').toUpperCase().trim();
          const network = NET_MAP[netKey];
          const plan_id = String(p.id ?? p.plan_id ?? '').trim();
          if (!network || !plan_id) { skipped++; continue; }

          const data_size = (String(p.name || p.plan || '').trim()) || 'Data';
          const validity = String(p.days ?? p.validity ?? p.duration ?? '').trim() || 'N/A';
          const cost = Number(p.user_price ?? p.agent_price ?? p.vendor_price ?? p.amount ?? p.price ?? 0);
          const plan_type = String(p.type || 'SME');
          const plan_name = `${netKey} ${data_size} (${validity})`;
          const category = /night/i.test(plan_type) ? 'night'
            : /(^|\b)(1day|1 day|daily|day\b)/i.test(validity) ? 'daily'
            : /(7day|week)/i.test(validity) ? 'weekly'
            : 'monthly';

          seen.add(`${network}:${plan_id}`);

          const { data: existing } = await svc
            .from('data_plans')
            .select('id, selling_price, cost_price')
            .eq('network', network).eq('plan_id', plan_id).maybeSingle();

          if (existing) {
            const oldCost = Number(existing.cost_price) || 0;
            const oldSell = Number(existing.selling_price) || 0;
            const markup = oldCost > 0 && oldSell > 0 ? oldSell / oldCost : 1.1;
            const selling_price = Math.max(Math.round(cost * markup), Math.round(cost));
            const { error } = await svc.from('data_plans').update({
              plan_name, data_size, validity, duration: validity, category,
              cost_price: cost, selling_price, api_code: plan_id,
              supplier: 'smeapi', is_active: true,
            }).eq('id', existing.id);
            if (error) { console.error('[sync-plans] update failed', plan_id, error.message); skipped++; }
            else updated++;
          } else {
            const selling_price = Math.max(Math.round(cost * 1.1), Math.round(cost) + 10);
            const { error } = await svc.from('data_plans').insert({
              network, plan_id, plan_name, data_size, validity, duration: validity,
              category, cost_price: cost, selling_price, api_code: plan_id,
              supplier: 'smeapi', is_active: true,
            });
            if (error) { console.error('[sync-plans] insert failed', plan_id, error.message); skipped++; }
            else imported++;
          }
        }

        // Remove plans that SMEAPI no longer returns
        const { data: allPlans } = await svc.from('data_plans').select('id, network, plan_id');
        const stale = (allPlans || []).filter((p: any) => !seen.has(`${p.network}:${p.plan_id}`)).map((p: any) => p.id);
        if (stale.length) {
          const { error } = await svc.from('data_plans').delete().in('id', stale);
          if (!error) removed = stale.length;
          else console.error('[sync-plans] delete stale failed', error.message);
        }

        console.log(`[sync-plans] imported=${imported} updated=${updated} removed=${removed} skipped=${skipped}`);
        return json({ success: true, imported, updated, removed, skipped, received: list.length });
      }
      case 'buy-data':
        result = await call('/data/', {
          method: 'POST',
          body: JSON.stringify({
            network: toNetworkId(payload.network) ?? payload.network,
            mobile_number: payload.phone,
            plan: payload.plan_id,
            Ported_number: true,
            pin: PIN,
          }),
        });
        break;
      case 'buy-airtime':
        result = await call('/airtime/', {
          method: 'POST',
          body: JSON.stringify({
            network: toNetworkId(payload.network) ?? payload.network,
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
