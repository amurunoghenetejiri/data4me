// DATA4ME SMEPlug proxy edge function — SECOND VTU provider.
// Independent of SMEAPI. Actions: status | balance | dataplans | sync-plans | buy-data | buy-airtime
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const BASE = (Deno.env.get('SMEPLUG_BASE_URL') || 'https://smeplug.ng/api/v1').replace(/\/+$/, '');
const KEY = Deno.env.get('SMEPLUG_API_KEY') || '';

// SMEPlug numeric network IDs
const NETWORK_ID_MAP: Record<string, number> = { MTN: 1, AIRTEL: 2, GLO: 3, '9MOBILE': 4 };
function toNetworkId(n: any): number | null {
  if (typeof n === 'number') return n;
  return NETWORK_ID_MAP[String(n || '').toUpperCase().trim()] ?? null;
}
const NET_KEY_BY_ID: Record<number, string> = { 1: 'mtn', 2: 'airtel', 3: 'glo', 4: '9mobile' };

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${KEY}`,
  };
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
    if (!KEY) return json({ error: 'SMEPLUG_API_KEY not configured', configured: false, provider: 'smeplug' }, 500);

    const url = new URL(req.url);
    let payload: any = {};
    if (req.method === 'POST') { try { payload = await req.json(); } catch { payload = {}; } }
    const action = url.searchParams.get('action') || payload?.action;

    switch (action) {
      case 'status':
      case 'balance': {
        const r = await call('/account/balance', { method: 'GET' });
        const balance = Number(
          r.body?.balance ?? r.body?.data?.balance ?? r.body?.wallet_balance ?? r.body?.account_balance ?? 0
        );
        return json({
          provider: 'smeplug',
          base_url: BASE,
          reachable: r.ok,
          status: r.status,
          latency_ms: r.latency_ms,
          balance,
          raw: r.body,
        });
      }

      case 'dataplans': {
        const r = await call('/data/plans', { method: 'GET' });
        return json(r.body, r.status);
      }

      case 'sync-plans': {
        const r = await call('/data/plans', { method: 'GET' });
        if (!r.ok) return json({ success: false, error: 'Failed to fetch plans', status: r.status, raw: r.body }, r.status);

        // SMEPlug returns plans grouped by network under data.plans
        const raw = r.body?.plans || r.body?.data?.plans || r.body?.data || r.body;
        const list: any[] = [];
        if (Array.isArray(raw)) {
          raw.forEach((p) => list.push(p));
        } else if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw)) {
            if (Array.isArray(v)) v.forEach((p: any) => list.push({ ...p, __network_key: k }));
          }
        }
        if (!list.length) return json({ success: false, error: 'SMEPlug returned no plans', raw: r.body }, 200);

        const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        let imported = 0, updated = 0, removed = 0, skipped = 0;
        const seen = new Set<string>();

        for (const p of list) {
          const net_id = toNetworkId(p.network_id ?? p.network ?? p.__network_key);
          const network = net_id ? NET_KEY_BY_ID[net_id] : String(p.__network_key || p.network || '').toLowerCase();
          const plan_id = String(p.id ?? p.plan_id ?? p.code ?? '').trim();
          if (!network || !plan_id) { skipped++; continue; }

          const data_size = String(p.size ?? p.name ?? p.plan ?? 'Data').trim();
          const validity = String(p.validity ?? p.duration ?? p.days ?? 'N/A').trim();
          const cost = Number(p.price ?? p.amount ?? p.user_price ?? 0);
          const plan_type = String(p.type ?? p.plan_type ?? 'SME');
          const plan_name = `${network.toUpperCase()} ${data_size} (${validity})`;
          const category = /night/i.test(plan_type) ? 'night'
            : /(day|daily)/i.test(validity) && /^1/.test(validity) ? 'daily'
            : /(week)/i.test(validity) ? 'weekly'
            : 'monthly';

          seen.add(`${network}:${plan_id}`);

          const { data: existing } = await svc
            .from('data_plans')
            .select('id, selling_price, cost_price')
            .eq('provider', 'smeplug').eq('plan_id', plan_id).maybeSingle();

          if (existing) {
            const oldCost = Number(existing.cost_price) || 0;
            const oldSell = Number(existing.selling_price) || 0;
            const markup = oldCost > 0 && oldSell > 0 ? oldSell / oldCost : 1.1;
            const selling_price = Math.max(Math.round(cost * markup), Math.round(cost));
            const { error } = await svc.from('data_plans').update({
              plan_name, data_size, validity, duration: validity, category, network,
              cost_price: cost, selling_price, api_code: plan_id,
              supplier: 'smeplug', provider: 'smeplug', is_active: true,
            }).eq('id', existing.id);
            if (error) { skipped++; console.error('[smeplug sync] update failed', error.message); } else updated++;
          } else {
            const selling_price = Math.max(Math.round(cost * 1.1), Math.round(cost) + 10);
            const { error } = await svc.from('data_plans').insert({
              network, plan_id, plan_name, data_size, validity, duration: validity,
              category, cost_price: cost, selling_price, api_code: plan_id,
              supplier: 'smeplug', provider: 'smeplug', is_active: true,
            });
            if (error) { skipped++; console.error('[smeplug sync] insert failed', error.message); } else imported++;
          }
        }

        // Remove stale SMEPlug-only plans
        const { data: allPlans } = await svc.from('data_plans').select('id, network, plan_id').eq('provider', 'smeplug');
        const stale = (allPlans || []).filter((p: any) => !seen.has(`${p.network}:${p.plan_id}`)).map((p: any) => p.id);
        if (stale.length) {
          const { error } = await svc.from('data_plans').delete().in('id', stale);
          if (!error) removed = stale.length;
        }

        return json({ success: true, imported, updated, removed, skipped, received: list.length });
      }

      case 'buy-data': {
        const r = await call('/data/purchase', {
          method: 'POST',
          body: JSON.stringify({
            network_id: toNetworkId(payload.network) ?? payload.network,
            plan_id: payload.plan_id,
            phone: payload.phone,
            customer_reference: payload.reference || `D4M-${Date.now()}`,
          }),
        });
        return json(r.body, r.status);
      }

      case 'buy-airtime': {
        const r = await call('/airtime/purchase', {
          method: 'POST',
          body: JSON.stringify({
            network_id: toNetworkId(payload.network) ?? payload.network,
            amount: payload.amount,
            phone: payload.phone,
            customer_reference: payload.reference || `D4M-${Date.now()}`,
          }),
        });
        return json(r.body, r.status);
      }

      default:
        return json({ error: 'Unknown action', action }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message, provider: 'smeplug' }, 500);
  }
});
