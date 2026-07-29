// DATA4ME VTU Purchase — Multi-provider (SMEAPI + SMEPlug) with wallet-hold flow.
// Wallet is only PERMANENTLY debited on provider success. Failures release the hold.
// On recoverable provider errors, an equivalent plan on the alternate provider is retried.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { notifyTelegram } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SMEAPI_BASE = (Deno.env.get('SMEAPI_BASE_URL') || 'https://smeapi.com.ng/api').replace(/\/+$/, '');
const SMEAPI_KEY = Deno.env.get('SMEAPI_API_KEY') || Deno.env.get('SMEAPI_KEY') || '';
const SMEAPI_USERNAME = Deno.env.get('SMEAPI_USERNAME') || '';
const SMEAPI_PIN = Deno.env.get('SMEAPI_PIN') || '';

const SMEPLUG_BASE = (Deno.env.get('SMEPLUG_BASE_URL') || 'https://smeplug.ng/api/v1').replace(/\/+$/, '');
const SMEPLUG_KEY = Deno.env.get('SMEPLUG_API_KEY') || '';

const SMEAPI_NET_ID: Record<string, number> = { MTN: 1, GLO: 2, '9MOBILE': 3, AIRTEL: 4 };
const SMEPLUG_NET_ID: Record<string, number> = { MTN: 1, AIRTEL: 2, GLO: 3, '9MOBILE': 4 };

//const CHARGE = 1;

// ---------- Response helpers ----------
const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const ok = (b: any) => j({ success: true, ...b });
const fail = (error: string, data: any = {}) => j({ success: false, error, data });

async function tg(title: string, emoji: string, rows: Record<string, any>) {
  try {
    await notifyTelegram(`${emoji} <b>DATA4ME • ${title}</b>\n` +
      Object.entries(rows).filter(([, v]) => v != null && v !== '').map(([k, v]) => `<b>${k}:</b> ${v}`).join('\n') +
      `\n<b>Time:</b> ${new Date().toISOString()}`);
  } catch {}
}

async function getServiceCharge(svc: any, service: string, amount: number): Promise<number> {
  try {
    const { data } = await svc
      .from("charge_settings")
      .select("mode, value, is_active")
      .eq("service", service)
      .maybeSingle();
    if (!data || !data.is_active) return 0;
    const value = Number(data.value) || 0;
    if (value <= 0) return 0;
    if (data.mode === "percent") {
      return Math.round((amount * value) / 100 * 100) / 100;
    }
    return value;
  } catch {
    return 0;
  }
}

// ---------- Auth ----------
async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing Authorization');
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data?.user) throw new Error('Not authenticated');
  return { id: data.user.id, email: data.user.email || undefined };
}

// ---------- Provider adapters ----------
type ProviderResult = { ok: boolean; recoverable: boolean; status: number; body: any; error?: string; reference?: string };

// SMEAPI success parser — SMEAPI returns { Status: "successful", ... }
function parseSmeapiSuccess(b: any): boolean {
  if (!b || typeof b !== 'object') return false;
  const s = String(b.Status ?? b.status ?? b.response_code ?? b.status_code ?? '').toLowerCase().trim();
  if (['successful', 'success', 'completed', 'complete', '200', '000'].includes(s)) return true;
  if (b.success === true || b.successful === true) return true;
  const msg = String(b.message ?? b.msg ?? '').toLowerCase();
  return msg.includes('successful') || msg.includes('completed');
}

// SMEPlug success parser — per SMEPlug docs, purchase endpoints return either:
//   { "status": true,  "msg": "Data purchase successful", "reference": "..." }
//   { "status": "success", "data": { "reference": "..." } }
// Failures come back as HTTP 200 with { "status": false, "msg": "..." } or
//   { "status": "failed", "msg": "..." }. Never trust HTTP status alone.
function parseSmeplugSuccess(b: any): boolean {
  if (!b || typeof b !== 'object') return false;
  const raw = b.status ?? b.Status;
  if (raw === true) return true;
  if (raw === false) return false;
  const s = String(raw ?? '').toLowerCase().trim();
  if (['success', 'successful', 'completed', 'complete', 'true', '1'].includes(s)) return true;
  if (['failed', 'failure', 'error', 'false', '0'].includes(s)) return false;
  if (b.success === true) return true;
  if (b.success === false) return false;
  // Fallback: look for explicit success wording in message.
  const msg = String(b.msg ?? b.message ?? '').toLowerCase();
  if (/(successful|completed|processed)/.test(msg)) return true;
  return false;
}

function smeplugReference(b: any): string | undefined {
  return b?.reference || b?.data?.reference || b?.data?.ident || b?.ident || b?.transaction_id || b?.data?.transaction_id;
}

// Recoverable = provider-side outage / rate-limit / network — safe to retry elsewhere.
// Non-recoverable = user data problem (invalid phone/plan/insufficient balance on provider side).
function isRecoverable(status: number, body: any): boolean {
  if (status >= 500) return true;
  if (status === 0 || status === 408 || status === 429) return true;
  const msg = String(body?.msg ?? body?.message ?? body?.error ?? '').toLowerCase();
  if (!msg) return status >= 500;
  return /(unavailable|timeout|temporarily|maintenance|try again|network|internal|down|busy|not available)/i.test(msg);
}

async function callSmeapi(path: string, body: any): Promise<ProviderResult> {
  if (!SMEAPI_KEY) return { ok: false, recoverable: false, status: 0, body: null, error: 'SMEAPI not configured' };
  try {
    const res = await fetch(`${SMEAPI_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${SMEAPI_KEY}`,
        'x-api-key': SMEAPI_KEY,
        ...(SMEAPI_USERNAME ? { 'x-username': SMEAPI_USERNAME } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let b: any; try { b = JSON.parse(text); } catch { b = { raw: text }; }
    const success = res.ok && parseSmeapiSuccess(b);
    return {
      ok: success,
      recoverable: !success && isRecoverable(res.status, b),
      status: res.status,
      body: b,
      error: success ? undefined : (b?.msg || b?.message || b?.error || `HTTP ${res.status}`),
      reference: b?.reference || b?.ident || b?.transaction_id,
    };
  } catch (e) {
    return { ok: false, recoverable: true, status: 0, body: null, error: (e as Error).message };
  }
}


async function callSmeplug(path: string, body: any): Promise<ProviderResult> {
  if (!SMEPLUG_KEY) return { ok: false, recoverable: false, status: 0, body: null, error: 'SMEPlug not configured' };
  try {
    const res = await fetch(`${SMEPLUG_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SMEPLUG_KEY}`, Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let b: any; try { b = JSON.parse(text); } catch { b = { raw: text }; }
    // IMPORTANT: SMEPlug returns HTTP 200 for both success AND failure. Never rely on res.ok alone.
    // Parse the JSON body using SMEPlug's own status/msg fields.
    const success = parseSmeplugSuccess(b);
    const errMsg = b?.msg || b?.message || b?.error || (success ? undefined : `Provider returned failure (HTTP ${res.status})`);
    return {
      ok: success,
      recoverable: !success && isRecoverable(res.status, b),
      status: res.status,
      body: b,
      error: success ? undefined : errMsg,
      reference: smeplugReference(b),
    };
  } catch (e) {
    return { ok: false, recoverable: true, status: 0, body: null, error: (e as Error).message };
  }
}

async function providerBuyAirtime(provider: string, network: string, phone: string, amount: number): Promise<ProviderResult> {
  const NET = network.toUpperCase();
  if (provider === 'smeapi') {
    const id = SMEAPI_NET_ID[NET]; if (!id) return { ok: false, recoverable: false, status: 0, body: null, error: `Unsupported network for SMEAPI: ${NET}` };
    return callSmeapi('/airtime/', { network: id, amount, mobile_number: phone, Ported_number: true, airtime_type: 'VTU', pin: SMEAPI_PIN });
  }
  if (provider === 'smeplug') {
    const id = SMEPLUG_NET_ID[NET]; if (!id) return { ok: false, recoverable: false, status: 0, body: null, error: `Unsupported network for SMEPlug: ${NET}` };
    return callSmeplug('/airtime/purchase', { network_id: id, amount, phone, customer_reference: `D4M-${Date.now()}` });
  }
  return { ok: false, recoverable: false, status: 0, body: null, error: `Unknown provider: ${provider}` };
}

async function providerBuyData(provider: string, network: string, planId: string, phone: string): Promise<ProviderResult> {
  const NET = network.toUpperCase();
  if (provider === 'smeapi') {
    const id = SMEAPI_NET_ID[NET]; if (!id) return { ok: false, recoverable: false, status: 0, body: null, error: `Unsupported network for SMEAPI: ${NET}` };
    return callSmeapi('/data/', { network: id, mobile_number: phone, plan: planId, Ported_number: true, pin: SMEAPI_PIN });
  }
  if (provider === 'smeplug') {
    const id = SMEPLUG_NET_ID[NET]; if (!id) return { ok: false, recoverable: false, status: 0, body: null, error: `Unsupported network for SMEPlug: ${NET}` };
    return callSmeplug('/data/purchase', { network_id: id, plan_id: planId, phone, customer_reference: `D4M-${Date.now()}` });
  }
  return { ok: false, recoverable: false, status: 0, body: null, error: `Unknown provider: ${provider}` };
}

// ---------- Logging ----------
async function logApi(svc: any, args: { user_id: string; provider: string; endpoint: string; request: any; response: any; status: number; error?: string }) {
  try {
    await svc.from('activity_logs').insert({
      user_id: args.user_id,
      user_email: null,
      event: `vtu:${args.provider}:${args.endpoint}`,
      category: 'vtu',
      details: { request: args.request, response: args.response, status: args.status, error: args.error },
    });
  } catch {}
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const payload = await req.json().catch(() => ({}));
    const action = payload.action;

    if (action === 'buy-airtime') return await handleAirtime(svc, user, payload);
    if (action === 'buy-data') return await handleData(svc, user, payload);
    return fail(`Unknown action: ${action}`);
  } catch (e: any) {
    console.error('[vtu-purchase] fatal', e?.message, e?.stack);
    return fail(e?.message || 'Server error');
  }
});

// ---------- Airtime ----------
async function handleAirtime(svc: any, user: { id: string; email?: string }, p: any) {
  const network = String(p.network || '').toUpperCase().trim();
  const phone = String(p.phone || '').trim();
  const amount = Number(p.amount);

  if (!/^0[789][01]\d{8}$/.test(phone)) return fail('Invalid Nigerian phone number');
  if (!['MTN', 'GLO', 'AIRTEL', '9MOBILE'].includes(network)) return fail('Unsupported network');
  if (!Number.isFinite(amount) || amount < 50 || amount > 1_000_000) return fail('Amount must be between ₦50 and ₦1,000,000');

  const charge = await getServiceCharge(svc, "airtime", amount);
  const total = amount + charge;

  // 1. Reserve funds
  let holdId: string;
  try {
    const { data, error } = await svc.rpc('create_wallet_hold', {
      _user_id: user.id, _amount: total, _purpose: 'airtime',
      _meta: { network, phone, product_amount: amount, charge },
    });
    if (error) throw error;
    holdId = data as string;
  } catch (e: any) {
    return fail(e?.message?.includes('Insufficient') ? 'Insufficient wallet balance' : (e?.message || 'Could not reserve funds'));
  }

  // 2. Try primary provider (SMEAPI), then SMEPlug on recoverable failure
  const attempts: Array<{ provider: string; result: ProviderResult }> = [];
  const providersOrder = ['smeapi', 'smeplug'];

  let finalResult: ProviderResult | null = null;
  let finalProvider = '';
  for (const provider of providersOrder) {
    const r = await providerBuyAirtime(provider, network, phone, amount);
    attempts.push({ provider, result: r });
    await logApi(svc, { user_id: user.id, provider, endpoint: 'buy-airtime', request: { network, phone, amount }, response: r.body, status: r.status, error: r.error });
    if (r.ok) { finalResult = r; finalProvider = provider; break; }
    if (!r.recoverable) { finalResult = r; finalProvider = provider; break; }
  }

  // 3. Commit or release
  if (finalResult?.ok) {
    const { data: tx, error: cErr } = await svc.rpc('commit_wallet_hold', {
      _hold_id: holdId, _type: 'airtime',
      _description: `${network} airtime ₦${amount} to ${phone}`,
_meta: {
  network, phone,
  product_amount: amount,
  cost_price: amount,
  charge,
  profit: charge,
  provider: finalProvider,
  supplier_reference: finalResult.reference,
  provider_response: finalResult.body,
},
    });
    if (cErr) {
      await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: 'commit-failed' });
      return fail(cErr.message || 'Commit failed');
    }
    tg('Airtime Success', '📱', {
      Provider: finalProvider, User: user.email || user.id, Network: network, Phone: phone,
      Amount: `₦${amount}`, Retries: attempts.length - 1, Reference: finalResult.reference || '-',
    });
    return ok({ tx_id: (tx as any)?.id, charge: CHARGE, total, provider: finalProvider, retries: attempts.length - 1, response: finalResult.body });
  }

  await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: finalResult?.error || 'provider-failed' });
  tg('Airtime Failed', '❌', {
    User: user.email || user.id, Network: network, Phone: phone, Amount: `₦${amount}`,
    Attempts: attempts.map((a) => `${a.provider}:${a.result.error || 'err'}`).join(' | '),
  });
  return fail(finalResult?.error || 'Airtime purchase failed', { refunded: true, attempts: attempts.map((a) => ({ provider: a.provider, error: a.result.error, status: a.result.status })) });
}

// ---------- Data ----------
async function handleData(svc: any, user: { id: string; email?: string }, p: any) {
  const planIdInternal = String(p.plan_id || '').trim();
  const phone = String(p.phone || '').trim();
  if (!/^0[789][01]\d{8}$/.test(phone)) return fail('Invalid Nigerian phone number');
  if (!planIdInternal) return fail('Plan is required');

  // Lookup selected plan
  const { data: plan, error: pErr } = await svc.from('data_plans').select('*').eq('id', planIdInternal).maybeSingle();
  if (pErr || !plan) return fail('Selected plan not found');
  if (!plan.is_active) return fail('Selected plan is not available');

  const network = String(plan.network || '').toUpperCase();
  const sellingPrice = Number(plan.selling_price);
  const charge = await getServiceCharge(svc, "data", sellingPrice);
  const total = sellingPrice + charge;
  // Reserve
  let holdId: string;
  try {
    const { data, error } = await svc.rpc('create_wallet_hold', {
      _user_id: user.id, _amount: total, _purpose: 'data',
      _meta: { plan_id: plan.id, provider: plan.provider, network, phone, product_amount: sellingPrice, charge },
    });
    if (error) throw error;
    holdId = data as string;
  } catch (e: any) {
    return fail(e?.message?.includes('Insufficient') ? 'Insufficient wallet balance' : (e?.message || 'Could not reserve funds'));
  }

  // Determine provider order: chosen plan's provider first, then equivalent on the other provider
  const primaryProvider = String(plan.provider || plan.supplier || 'smeapi');
  const secondaryProvider = primaryProvider === 'smeapi' ? 'smeplug' : 'smeapi';

  // Find equivalent plan on secondary provider by (network, data_size, validity)
  const { data: alt } = await svc.from('data_plans').select('*')
    .eq('provider', secondaryProvider)
    .eq('network', plan.network)
    .eq('data_size', plan.data_size)
    .eq('validity', plan.validity)
    .eq('is_active', true)
    .limit(1).maybeSingle();

  const attempts: Array<{ provider: string; result: ProviderResult; plan_id: string }> = [];
  let finalResult: ProviderResult | null = null;
  let finalProvider = '';
  let finalProviderPlanId = '';

  const tryList: Array<{ provider: string; providerPlanId: string }> = [{ provider: primaryProvider, providerPlanId: plan.plan_id }];
  if (alt) tryList.push({ provider: secondaryProvider, providerPlanId: alt.plan_id });

  for (const t of tryList) {
    const r = await providerBuyData(t.provider, network, t.providerPlanId, phone);
    attempts.push({ provider: t.provider, result: r, plan_id: t.providerPlanId });
    await logApi(svc, { user_id: user.id, provider: t.provider, endpoint: 'buy-data', request: { network, plan_id: t.providerPlanId, phone }, response: r.body, status: r.status, error: r.error });
    if (r.ok) { finalResult = r; finalProvider = t.provider; finalProviderPlanId = t.providerPlanId; break; }
    if (!r.recoverable) { finalResult = r; finalProvider = t.provider; finalProviderPlanId = t.providerPlanId; break; }
  }

  if (finalResult?.ok) {
    const costPrice = Number(plan.cost_price || 0);
    const dataProfit = Math.max(0, sellingPrice - costPrice);

    const { data: tx, error: cErr } = await svc.rpc('commit_wallet_hold', {
      _hold_id: holdId, _type: 'data',
      _description: `${network} ${plan.data_size} / ${plan.validity} to ${phone}`,
      _meta: {
        plan_id: plan.id, network, phone,
        product_amount: sellingPrice,
        cost_price: costPrice,
        charge,
        profit: dataProfit,
        provider: finalProvider, original_provider: primaryProvider,
        provider_plan_id: finalProviderPlanId,
        retry_count: attempts.length - 1,
        supplier_reference: finalResult.reference,
        provider_response: finalResult.body,
      },
    });
    if (cErr) {
      await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: 'commit-failed' });
      return fail(cErr.message || 'Commit failed');
    }
    tg('Data Success', '📶', {
      Provider: finalProvider, User: user.email || user.id, Network: network, Phone: phone,
      Plan: `${plan.data_size} / ${plan.validity}`, Amount: `₦${sellingPrice}`, Retries: attempts.length - 1,
    });
    return ok({ tx_id: (tx as any)?.id, charge, total, provider: finalProvider, retries: attempts.length - 1, response: finalResult.body });
  }

  await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: finalResult?.error || 'provider-failed' });
  tg('Data Failed', '❌', {
    User: user.email || user.id, Network: network, Phone: phone, Plan: `${plan.data_size} / ${plan.validity}`,
    Attempts: attempts.map((a) => `${a.provider}:${a.result.error || 'err'}`).join(' | '),
  });
  return fail(finalResult?.error || 'Data purchase failed', { refunded: true, attempts: attempts.map((a) => ({ provider: a.provider, error: a.result.error, status: a.result.status })) });
}
