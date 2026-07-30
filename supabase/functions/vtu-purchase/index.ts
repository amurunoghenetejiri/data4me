// DATA4ME VTU Purchase — Multi-provider (SMEAPI + SMEPlug) with wallet-hold flow.
// Wallet is only PERMANENTLY debited on provider success. Failures release the hold.
// User-facing errors are always short and plain (no provider codes / HTTP text).
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
const SMEPLUG_NET_ID: Record<string, number> = { MTN: 1, AIRTEL: 2, '9MOBILE': 3, GLO: 4 };

const NETWORK_BY_ID: Record<string, string> = {
  '1': 'MTN',
  '2': 'AIRTEL',
  '3': '9MOBILE',
  '4': 'GLO',
};

function normalizeNetwork(raw: string): string {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'mtn') return 'MTN';
  if (s === 'glo') return 'GLO';
  if (s === 'airtel') return 'AIRTEL';
  if (s === '9mobile' || s === '9mobile' || s === 'etisalat') return '9MOBILE';
  // Already uppercase names
  const u = s.toUpperCase();
  if (['MTN', 'GLO', 'AIRTEL', '9MOBILE'].includes(u)) return u;
  // Do NOT map 1/2/3/4 here — SMEAPI and SMEPlug use different IDs
  return u;
}

const j = (b: any, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
const ok = (b: any) => j({ success: true, ...b });
const fail = (error: string, data: any = {}) => j({ success: false, error, data });

/** Map any raw error to a short message safe for users. */
function userSafeError(raw?: string | null): string {
  const msg = String(raw || '').toLowerCase();
  if (!msg) return 'Transaction failed. Please try again.';

  if (msg.includes('insufficient')) {
    return 'Insufficient wallet balance. Fund your wallet and try again.';
  }
  if (msg.includes('invalid') && msg.includes('phone')) {
    return 'Enter a valid Nigerian phone number.';
  }
  if (msg.includes('unsupported network')) {
    return 'Selected network is not supported. Please try another network.';
  }
  if (
    msg.includes('plan is required') ||
    msg.includes('plan not found') ||
    msg.includes('not available')
  ) {
    return 'Selected plan is not available. Please choose another plan.';
  }
  if (msg.includes('amount must be') || msg.includes('invalid amount')) {
    return 'Invalid amount. Please check and try again.';
  }
  if (msg.includes('not authenticated') || msg.includes('authorization') || msg.includes('sign in')) {
    return 'Please sign in and try again.';
  }
  if (
    msg.includes('timeout') ||
    msg.includes('unavailable') ||
    msg.includes('maintenance') ||
    msg.includes('try again') ||
    msg.includes('temporarily') ||
    msg.includes('low balance') ||
    msg.includes('insufficient fund') ||
    msg.includes('not configured') ||
    msg.includes('busy') ||
    msg.includes('down') ||
    msg.includes('provider') ||
    msg.includes('smeapi') ||
    msg.includes('smeplug') ||
    msg.includes('http') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('network')
  ) {
    return 'Service temporarily unavailable. Please try again later.';
  }
  return 'Transaction failed. Please try again.';
}

async function tg(title: string, emoji: string, rows: Record<string, any>) {
  try {
    await notifyTelegram(
      `${emoji} <b>DATA4ME • ${title}</b>\n` +
        Object.entries(rows)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => `<b>${k}:</b> ${v}`)
          .join('\n') +
        `\n<b>Time:</b> ${new Date().toISOString()}`
    );
  } catch {}
}

async function getServiceCharge(svc: any, service: string, amount: number): Promise<number> {
  try {
    const { data } = await svc
      .from('charge_settings')
      .select('mode, value, is_active')
      .eq('service', service)
      .maybeSingle();
    if (!data || !data.is_active) return 0;
    const value = Number(data.value) || 0;
    if (value <= 0) return 0;
    if (data.mode === 'percent') {
      return Math.round(((amount * value) / 100) * 100) / 100;
    }
    return value;
  } catch {
    return 0;
  }
}

async function awardCashbackIfAny(
  svc: any,
  userId: string,
  service: string,
  amount: number,
  sourceTxId: string | null
): Promise<number> {
  try {
    const { data, error } = await svc.rpc('award_cashback', {
      _user_id: userId,
      _service: service,
      _amount: amount,
      _source_tx_id: sourceTxId,
    });
    if (error) {
      console.error('[vtu-purchase] cashback error', error.message);
      return 0;
    }
    return Number(data) || 0;
  } catch (e) {
    console.error('[vtu-purchase] cashback exception', e);
    return 0;
  }
}

async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing Authorization');
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data?.user) throw new Error('Not authenticated');
  return { id: data.user.id, email: data.user.email || undefined };
}

type ProviderResult = {
  ok: boolean;
  recoverable: boolean;
  status: number;
  body: any;
  error?: string;
  reference?: string;
};

function parseSmeapiSuccess(b: any): boolean {
  if (!b || typeof b !== 'object') return false;
  const s = String(b.Status ?? b.status ?? b.response_code ?? b.status_code ?? '')
    .toLowerCase()
    .trim();
  if (['successful', 'success', 'completed', 'complete', '200', '000'].includes(s)) return true;
  if (b.success === true || b.successful === true) return true;
  const msg = String(b.message ?? b.msg ?? '').toLowerCase();
  return msg.includes('successful') || msg.includes('completed');
}

function parseSmeplugSuccess(b: any): boolean {
  if (!b || typeof b !== 'object') return false;
  const raw = b.status ?? b.Status;
  if (raw === true) return true;
  if (raw === false) return false;
  const s = String(raw ?? '')
    .toLowerCase()
    .trim();
  if (['success', 'successful', 'completed', 'complete', 'true', '1'].includes(s)) return true;
  if (['failed', 'failure', 'error', 'false', '0'].includes(s)) return false;
  if (b.success === true) return true;
  if (b.success === false) return false;
  const msg = String(b.msg ?? b.message ?? '').toLowerCase();
  if (/(successful|completed|processed)/.test(msg)) return true;
  return false;
}

function smeplugReference(b: any): string | undefined {
  return (
    b?.reference ||
    b?.data?.reference ||
    b?.data?.ident ||
    b?.ident ||
    b?.transaction_id ||
    b?.data?.transaction_id
  );
}

function isRecoverable(status: number, body: any): boolean {
  if (status >= 500) return true;
  if (status === 0 || status === 408 || status === 429) return true;
  const msg = String(body?.msg ?? body?.message ?? body?.error ?? '').toLowerCase();
  if (!msg) return status >= 500;
  return /(unavailable|timeout|temporarily|maintenance|try again|network|internal|down|busy|not available)/i.test(
    msg
  );
}

async function callSmeapi(path: string, body: any): Promise<ProviderResult> {
  if (!SMEAPI_KEY) {
    return { ok: false, recoverable: false, status: 0, body: null, error: 'SMEAPI not configured' };
  }
  try {
    const res = await fetch(`\( {SMEAPI_BASE} \){path}`, {
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
    let b: any;
    try {
      b = JSON.parse(text);
    } catch {
      b = { raw: text };
    }
    const success = res.ok && parseSmeapiSuccess(b);
    return {
      ok: success,
      recoverable: !success && isRecoverable(res.status, b),
      status: res.status,
      body: b,
      error: success ? undefined : b?.msg || b?.message || b?.error || `HTTP ${res.status}`,
      reference: b?.reference || b?.ident || b?.transaction_id,
    };
  } catch (e) {
    return { ok: false, recoverable: true, status: 0, body: null, error: (e as Error).message };
  }
}

async function callSmeplug(path: string, body: any): Promise<ProviderResult> {
  if (!SMEPLUG_KEY) {
    return { ok: false, recoverable: false, status: 0, body: null, error: 'SMEPlug not configured' };
  }
  try {
    const res = await fetch(`\( {SMEPLUG_BASE} \){path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SMEPLUG_KEY}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let b: any;
    try {
      b = JSON.parse(text);
    } catch {
      b = { raw: text };
    }
    const success = parseSmeplugSuccess(b);
    const errMsg =
      b?.msg ||
      b?.message ||
      b?.error ||
      (success ? undefined : `Provider returned failure (HTTP ${res.status})`);
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

async function providerBuyAirtime(
  provider: string,
  network: string,
  phone: string,
  amount: number
): Promise<ProviderResult> {
  const NET = normalizeNetwork(network);
  if (provider === 'smeapi') {
    const id = SMEAPI_NET_ID[NET];
    if (!id) {
      return { ok: false, recoverable: false, status: 0, body: null, error: `Unsupported network for SMEAPI: ${NET}` };
    }
    return callSmeapi('/airtime/', {
      network: id,
      amount,
      mobile_number: phone,
      Ported_number: true,
      airtime_type: 'VTU',
      pin: SMEAPI_PIN,
    });
  }
  if (provider === 'smeplug') {
    const id = SMEPLUG_NET_ID[NET];
    if (!id) {
      return { ok: false, recoverable: false, status: 0, body: null, error: `Unsupported network for SMEPlug: ${NET}` };
    }
    return callSmeplug('/airtime/purchase', {
      network_id: id,
      amount,
      phone,
      customer_reference: `D4M-${Date.now()}`,
    });
  }
  return { ok: false, recoverable: false, status: 0, body: null, error: `Unknown provider: ${provider}` };
}

async function providerBuyData(
  provider: string,
  network: string,
  planId: string,
  phone: string
): Promise<ProviderResult> {
  const NET = normalizeNetwork(network);
  if (provider === 'smeapi') {
    const id = SMEAPI_NET_ID[NET];
    if (!id) {
      return { ok: false, recoverable: false, status: 0, body: null, error: `Unsupported network for SMEAPI: ${NET}` };
    }
    return callSmeapi('/data/', {
      network: id,
      mobile_number: phone,
      plan: planId,
      Ported_number: true,
      pin: SMEAPI_PIN,
    });
  }
  if (provider === 'smeplug') {
    const id = SMEPLUG_NET_ID[NET];
    if (!id) {
      return { ok: false, recoverable: false, status: 0, body: null, error: `Unsupported network for SMEPlug: ${NET}` };
    }
    return callSmeplug('/data/purchase', {
      network_id: id,
      plan_id: planId,
      phone,
      customer_reference: `D4M-${Date.now()}`,
    });
  }
  return { ok: false, recoverable: false, status: 0, body: null, error: `Unknown provider: ${provider}` };
}

async function logApi(
  svc: any,
  args: {
    user_id: string;
    provider: string;
    endpoint: string;
    request: any;
    response: any;
    status: number;
    error?: string;
  }
) {
  try {
    await svc.from('activity_logs').insert({
      user_id: args.user_id,
      user_email: null,
      event: `vtu:\( {args.provider}: \){args.endpoint}`,
      category: 'vtu',
      details: {
        request: args.request,
        response: args.response,
        status: args.status,
        error: args.error,
      },
    });
  } catch {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const payload = await req.json().catch(() => ({}));
    const action = payload.action;

    if (action === 'buy-airtime') return await handleAirtime(svc, user, payload);
    if (action === 'buy-data') return await handleData(svc, user, payload);
    return fail('Something went wrong. Please try again.');
  } catch (e: any) {
    console.error('[vtu-purchase] fatal', e?.message, e?.stack);
    return fail(userSafeError(e?.message));
  }
});

async function handleAirtime(svc: any, user: { id: string; email?: string }, p: any) {
  const network = normalizeNetwork(String(p.network || ''));
  const phone = String(p.phone || '').trim();
  const amount = Number(p.amount);

  if (!/^0[789][01]\d{8}$/.test(phone)) {
    return fail('Enter a valid Nigerian phone number.');
  }
  if (!['MTN', 'GLO', 'AIRTEL', '9MOBILE'].includes(network)) {
    return fail('Selected network is not supported. Please try another network.');
  }
  if (!Number.isFinite(amount) || amount < 50 || amount > 1_000_000) {
    return fail('Invalid amount. Please check and try again.');
  }

  const charge = await getServiceCharge(svc, 'airtime', amount);
  const total = amount + charge;

  let holdId: string;
  try {
    const { data, error } = await svc.rpc('create_wallet_hold', {
      _user_id: user.id,
      _amount: total,
      _purpose: 'airtime',
      _meta: { network, phone, product_amount: amount, charge },
    });
    if (error) throw error;
    holdId = data as string;
  } catch (e: any) {
    return fail(userSafeError(e?.message));
  }

  const attempts: Array<{ provider: string; result: ProviderResult }> = [];
  const providersOrder = ['smeapi', 'smeplug'];

  let finalResult: ProviderResult | null = null;
  let finalProvider = '';
  for (const provider of providersOrder) {
    const r = await providerBuyAirtime(provider, network, phone, amount);
    attempts.push({ provider, result: r });
    await logApi(svc, {
      user_id: user.id,
      provider,
      endpoint: 'buy-airtime',
      request: { network, phone, amount },
      response: r.body,
      status: r.status,
      error: r.error,
    });
    if (r.ok) {
      finalResult = r;
      finalProvider = provider;
      break;
    }
    if (!r.recoverable) {
      finalResult = r;
      finalProvider = provider;
      break;
    }
  }

  if (finalResult?.ok) {
    const { data: tx, error: cErr } = await svc.rpc('commit_wallet_hold', {
      _hold_id: holdId,
      _type: 'airtime',
      _description: `\( {network} airtime ₦ \){amount} to ${phone}`,
      _meta: {
        network,
        phone,
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
      return fail('Transaction failed. Please try again.');
    }

    const txId = (tx as any)?.id || null;
    const cashback = await awardCashbackIfAny(svc, user.id, 'airtime', amount, txId);

    tg('Airtime Success', '📱', {
      Provider: finalProvider,
      User: user.email || user.id,
      Network: network,
      Phone: phone,
      Amount: `₦${amount}`,
      Cashback: cashback > 0 ? `₦${cashback}` : '0',
      Retries: attempts.length - 1,
      Reference: finalResult.reference || '-',
    });

    return ok({
      tx_id: txId,
      charge,
      total,
      cashback,
      provider: finalProvider,
      retries: attempts.length - 1,
      response: finalResult.body,
    });
  }

  await svc.rpc('release_wallet_hold', {
    _hold_id: holdId,
    _reason: finalResult?.error || 'provider-failed',
  });

  // Full detail for admin Telegram only
  tg('Airtime Failed', '❌', {
    User: user.email || user.id,
    Network: network,
    Phone: phone,
    Amount: `₦${amount}`,
    Attempts: attempts.map((a) => `\( {a.provider}: \){a.result.error || 'err'}`).join(' | '),
  });

  // Clean message for the user only
  return fail(userSafeError(finalResult?.error), {
    refunded: true,
  });
}

async function handleData(svc: any, user: { id: string; email?: string }, p: any) {
  const planIdInternal = String(p.plan_id || '').trim();
  const phone = String(p.phone || '').trim();
  if (!/^0[789][01]\d{8}$/.test(phone)) {
    return fail('Enter a valid Nigerian phone number.');
  }
  if (!planIdInternal) {
    return fail('Please select a data plan.');
  }

  const { data: plan, error: pErr } = await svc
    .from('data_plans')
    .select('*')
    .eq('id', planIdInternal)
    .maybeSingle();
  if (pErr || !plan) return fail('Selected plan is not available. Please choose another plan.');
  if (!plan.is_active) return fail('Selected plan is not available. Please choose another plan.');

  const network = normalizeNetwork(String(plan.network || ''));
  const sellingPrice = Number(plan.selling_price);
  const charge = await getServiceCharge(svc, 'data', sellingPrice);
  const total = sellingPrice + charge;

  let holdId: string;
  try {
    const { data, error } = await svc.rpc('create_wallet_hold', {
      _user_id: user.id,
      _amount: total,
      _purpose: 'data',
      _meta: {
        plan_id: plan.id,
        provider: plan.provider,
        network,
        phone,
        product_amount: sellingPrice,
        charge,
      },
    });
    if (error) throw error;
    holdId = data as string;
  } catch (e: any) {
    return fail(userSafeError(e?.message));
  }

  const primaryProvider = String(plan.provider || plan.supplier || 'smeapi');
  const secondaryProvider = primaryProvider === 'smeapi' ? 'smeplug' : 'smeapi';

  const { data: alt } = await svc
    .from('data_plans')
    .select('*')
    .eq('provider', secondaryProvider)
    .eq('network', plan.network)
    .eq('data_size', plan.data_size)
    .eq('validity', plan.validity)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const attempts: Array<{ provider: string; result: ProviderResult; plan_id: string }> = [];
  let finalResult: ProviderResult | null = null;
  let finalProvider = '';
  let finalProviderPlanId = '';

  const tryList: Array<{ provider: string; providerPlanId: string }> = [
    { provider: primaryProvider, providerPlanId: plan.plan_id },
  ];
  if (alt) tryList.push({ provider: secondaryProvider, providerPlanId: alt.plan_id });

  for (const t of tryList) {
    const r = await providerBuyData(t.provider, network, t.providerPlanId, phone);
    attempts.push({ provider: t.provider, result: r, plan_id: t.providerPlanId });
    await logApi(svc, {
      user_id: user.id,
      provider: t.provider,
      endpoint: 'buy-data',
      request: { network, plan_id: t.providerPlanId, phone },
      response: r.body,
      status: r.status,
      error: r.error,
    });
    if (r.ok) {
      finalResult = r;
      finalProvider = t.provider;
      finalProviderPlanId = t.providerPlanId;
      break;
    }
    if (!r.recoverable) {
      finalResult = r;
      finalProvider = t.provider;
      finalProviderPlanId = t.providerPlanId;
      break;
    }
  }

  if (finalResult?.ok) {
    const costPrice = Number(plan.cost_price || 0);
    const dataProfit = Math.max(0, sellingPrice - costPrice);

    const { data: tx, error: cErr } = await svc.rpc('commit_wallet_hold', {
      _hold_id: holdId,
      _type: 'data',
      _description: `${network} ${plan.data_size} / ${plan.validity} to ${phone}`,
      _meta: {
        plan_id: plan.id,
        network,
        phone,
        product_amount: sellingPrice,
        cost_price: costPrice,
        charge,
        profit: dataProfit,
        provider: finalProvider,
        original_provider: primaryProvider,
        provider_plan_id: finalProviderPlanId,
        retry_count: attempts.length - 1,
        supplier_reference: finalResult.reference,
        provider_response: finalResult.body,
      },
    });
    if (cErr) {
      await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: 'commit-failed' });
      return fail('Transaction failed. Please try again.');
    }

    const txId = (tx as any)?.id || null;
    const cashback = await awardCashbackIfAny(svc, user.id, 'data', sellingPrice, txId);

    tg('Data Success', '📶', {
      Provider: finalProvider,
      User: user.email || user.id,
      Network: network,
      Phone: phone,
      Plan: `${plan.data_size} / ${plan.validity}`,
      Amount: `₦${sellingPrice}`,
      Cashback: cashback > 0 ? `₦${cashback}` : '0',
      Retries: attempts.length - 1,
    });

    return ok({
      tx_id: txId,
      charge,
      total,
      cashback,
      provider: finalProvider,
      retries: attempts.length - 1,
      response: finalResult.body,
    });
  }

  await svc.rpc('release_wallet_hold', {
    _hold_id: holdId,
    _reason: finalResult?.error || 'provider-failed',
  });

  tg('Data Failed', '❌', {
    User: user.email || user.id,
    Network: network,
    Phone: phone,
    Plan: `${plan.data_size} / ${plan.validity}`,
    Attempts: attempts.map((a) => `\( {a.provider}: \){a.result.error || 'err'}`).join(' | '),
  });

  return fail(userSafeError(finalResult?.error), {
    refunded: true,
  });
}
