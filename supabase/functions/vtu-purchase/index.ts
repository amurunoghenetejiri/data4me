// DATA4ME VTU Purchase — Multi-provider (SMEAPI + SMEPlug) with wallet-hold flow.
// IMPORTANT: Do not use ${} template strings for dynamic values in this file.
// Some editors/pipelines strip the $ and break the live function.
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

function normalizeNetwork(raw: string, provider?: string): string {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'mtn') return 'MTN';
  if (s === 'glo') return 'GLO';
  if (s === 'airtel') return 'AIRTEL';
  if (s === '9mobile' || s === 'etisalat') return '9MOBILE';

  const u = s.toUpperCase();
  if (u === 'MTN' || u === 'GLO' || u === 'AIRTEL' || u === '9MOBILE') return u;

  const p = String(provider || '').toLowerCase();
  if (p.indexOf('smeplug') !== -1) {
    if (s === '1') return 'MTN';
    if (s === '2') return 'AIRTEL';
    if (s === '3') return '9MOBILE';
    if (s === '4') return 'GLO';
  } else {
    if (s === '1') return 'MTN';
    if (s === '2') return 'GLO';
    if (s === '3') return '9MOBILE';
    if (s === '4') return 'AIRTEL';
  }
  return u;
}

function inferNetwork(...cands: any[]): string {
  for (const c of cands) {
    const t = String(c || '').toUpperCase();
    if (t.indexOf('9MOBILE') !== -1 || t.indexOf('ETISALAT') !== -1) return '9MOBILE';
    if (t.indexOf('AIRTEL') !== -1) return 'AIRTEL';
    if (t.indexOf('MTN') !== -1) return 'MTN';
    if (t.indexOf('GLO') !== -1) return 'GLO';
  }
  return '';
}

const j = (b: any, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
const ok = (b: any) => j({ success: true, ...b });
const fail = (error: string, data: any = {}) => j({ success: false, error, data });

function userSafeError(raw?: string | null): string {
  const msg = String(raw || '').toLowerCase();
  if (!msg) return 'Transaction failed. Please try again.';
  if (msg.indexOf('insufficient') !== -1) {
    return 'Insufficient wallet balance. Fund your wallet and try again.';
  }
  if (msg.indexOf('invalid') !== -1 && msg.indexOf('phone') !== -1) {
    return 'Enter a valid Nigerian phone number.';
  }
  if (msg.indexOf('unsupported network') !== -1) {
    return 'Selected network is not supported. Please try another network.';
  }
  if (
    msg.indexOf('plan is required') !== -1 ||
    msg.indexOf('plan not found') !== -1 ||
    msg.indexOf('not available') !== -1
  ) {
    return 'Selected plan is not available. Please choose another plan.';
  }
  if (msg.indexOf('amount must be') !== -1 || msg.indexOf('invalid amount') !== -1) {
    return 'Invalid amount. Please check and try again.';
  }
  if (
    msg.indexOf('not authenticated') !== -1 ||
    msg.indexOf('authorization') !== -1 ||
    msg.indexOf('sign in') !== -1
  ) {
    return 'Please sign in and try again.';
  }
  if (
    msg.indexOf('timeout') !== -1 ||
    msg.indexOf('unavailable') !== -1 ||
    msg.indexOf('maintenance') !== -1 ||
    msg.indexOf('try again') !== -1 ||
    msg.indexOf('temporarily') !== -1 ||
    msg.indexOf('low balance') !== -1 ||
    msg.indexOf('insufficient fund') !== -1 ||
    msg.indexOf('not configured') !== -1 ||
    msg.indexOf('busy') !== -1 ||
    msg.indexOf('down') !== -1 ||
    msg.indexOf('provider') !== -1 ||
    msg.indexOf('smeapi') !== -1 ||
    msg.indexOf('smeplug') !== -1 ||
    msg.indexOf('http') !== -1 ||
    msg.indexOf('500') !== -1 ||
    msg.indexOf('502') !== -1 ||
    msg.indexOf('503') !== -1 ||
    msg.indexOf('429') !== -1 ||
    msg.indexOf('network') !== -1
  ) {
    return 'Service temporarily unavailable. Please try again later.';
  }
  return 'Transaction failed. Please try again.';
}

async function tg(title: string, emoji: string, rows: Record<string, any>) {
  try {
    let body = emoji + ' <b>DATA4ME • ' + title + '</b>\n';
    for (const k of Object.keys(rows)) {
      const v = rows[k];
      if (v == null || v === '') continue;
      body += '<b>' + k + ':</b> ' + String(v) + '\n';
    }
    body += '<b>Time:</b> ' + new Date().toISOString();
    await notifyTelegram(body);
  } catch (_) {}
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
  } catch (_) {
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
  if (['successful', 'success', 'completed', 'complete', '200', '000'].indexOf(s) !== -1) return true;
  if (b.success === true || b.successful === true) return true;
  const msg = String(b.message ?? b.msg ?? '').toLowerCase();
  return msg.indexOf('successful') !== -1 || msg.indexOf('completed') !== -1;
}

function parseSmeplugSuccess(b: any): boolean {
  if (!b || typeof b !== 'object') return false;
  const raw = b.status ?? b.Status;
  if (raw === true) return true;
  if (raw === false) return false;
  const s = String(raw ?? '')
    .toLowerCase()
    .trim();
  if (['success', 'successful', 'completed', 'complete', 'true', '1'].indexOf(s) !== -1) return true;
  if (['failed', 'failure', 'error', 'false', '0'].indexOf(s) !== -1) return false;
  if (b.success === true) return true;
  if (b.success === false) return false;
  const msg = String(b.msg ?? b.message ?? '').toLowerCase();
  if (msg.indexOf('successful') !== -1 || msg.indexOf('completed') !== -1 || msg.indexOf('processed') !== -1) {
    return true;
  }
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
  return (
    msg.indexOf('unavailable') !== -1 ||
    msg.indexOf('timeout') !== -1 ||
    msg.indexOf('temporarily') !== -1 ||
    msg.indexOf('maintenance') !== -1 ||
    msg.indexOf('try again') !== -1 ||
    msg.indexOf('network') !== -1 ||
    msg.indexOf('internal') !== -1 ||
    msg.indexOf('down') !== -1 ||
    msg.indexOf('busy') !== -1 ||
    msg.indexOf('not available') !== -1
  );
}

function formatAttempts(attempts: Array<{ provider: string; result: ProviderResult }>): string {
  if (!attempts.length) return 'none';
  return attempts
    .map(function (a) {
      const st = a.result.status ? ' HTTP ' + a.result.status : '';
      return a.provider + st + ' → ' + (a.result.ok ? 'success' : a.result.error || 'unknown error');
    })
    .join(' | ');
}

function lastError(attempts: Array<{ provider: string; result: ProviderResult }>): string {
  if (!attempts.length) return 'No provider responded';
  const last = attempts[attempts.length - 1];
  return last.result.error || 'Unknown provider error';
}

function lastProvider(attempts: Array<{ provider: string; result: ProviderResult }>): string {
  return attempts.length ? attempts[attempts.length - 1].provider : '-';
}


async function callSmeapi(path: string, body: any): Promise<ProviderResult> {
  if (!SMEAPI_KEY) {
    return { ok: false, recoverable: false, status: 0, body: null, error: 'SMEAPI not configured' };
  }
  try {
    const res = await fetch(SMEAPI_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Token ' + SMEAPI_KEY,
        'x-api-key': SMEAPI_KEY,
        ...(SMEAPI_USERNAME ? { 'x-username': SMEAPI_USERNAME } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let b: any;
    try {
      b = JSON.parse(text);
    } catch (_) {
      b = { raw: text };
    }
    const providerSuccess = parseSmeapiSuccess(b);
    const success = res.ok && providerSuccess;
    return {
      ok: success,
      recoverable: !success && isRecoverable(res.status, b),
      status: res.status,
      body: b,
      error: success ? undefined : b?.msg || b?.message || b?.error || ('HTTP ' + res.status),
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
    const res = await fetch(SMEPLUG_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + SMEPLUG_KEY,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let b: any;
    try {
      b = JSON.parse(text);
    } catch (_) {
      b = { raw: text };
    }
    const success = parseSmeplugSuccess(b);
    const errMsg =
      b?.msg ||
      b?.message ||
      b?.error ||
      (success ? undefined : 'Provider returned failure (HTTP ' + res.status + ')');
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
  const NET = normalizeNetwork(network, provider);
  if (provider === 'smeapi') {
    const id = SMEAPI_NET_ID[NET];
    if (!id) {
      return {
        ok: false,
        recoverable: false,
        status: 0,
        body: null,
        error: 'Unsupported network for SMEAPI: ' + NET,
      };
    }
    return callSmeapi('/airtime/', {
      network: id,
      amount: amount,
      mobile_number: phone,
      Ported_number: true,
      airtime_type: 'VTU',
      pin: SMEAPI_PIN,
    });
  }
  if (provider === 'smeplug') {
    const id = SMEPLUG_NET_ID[NET];
    if (!id) {
      return {
        ok: false,
        recoverable: false,
        status: 0,
        body: null,
        error: 'Unsupported network for SMEPlug: ' + NET,
      };
    }
    return callSmeplug('/airtime/purchase', {
      network_id: id,
      amount: amount,
      phone: phone,
      customer_reference: 'D4M-' + Date.now(),
    });
  }
  return {
    ok: false,
    recoverable: false,
    status: 0,
    body: null,
    error: 'Unknown provider: ' + provider,
  };
}

async function providerBuyData(
  provider: string,
  network: string,
  planId: string,
  phone: string
): Promise<ProviderResult> {
  const NET = normalizeNetwork(network, provider);
  if (provider === 'smeapi') {
    const id = SMEAPI_NET_ID[NET];
    if (!id) {
      return {
        ok: false,
        recoverable: false,
        status: 0,
        body: null,
        error: 'Unsupported network for SMEAPI: ' + NET,
      };
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
      return {
        ok: false,
        recoverable: false,
        status: 0,
        body: null,
        error: 'Unsupported network for SMEPlug: ' + NET,
      };
    }
    return callSmeplug('/data/purchase', {
      network_id: id,
      plan_id: planId,
      phone: phone,
      customer_reference: 'D4M-' + Date.now(),
    });
  }
  return {
    ok: false,
    recoverable: false,
    status: 0,
    body: null,
    error: 'Unknown provider: ' + provider,
  };
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
  console.log(
    '[vtu-purchase]',
    JSON.stringify({
      ts: new Date().toISOString(),
      user_id: args.user_id,
      provider: args.provider,
      endpoint: args.endpoint,
      http_status: args.status,
      request: args.request,
      response: args.response,
      error: args.error,
    })
  );
  try {
    await svc.from('activity_logs').insert({
      user_id: args.user_id,
      user_email: null,
      event: 'vtu:' + args.provider + ':' + args.endpoint,
      category: 'vtu',
      details: {
        request: args.request,
        response: args.response,
        status: args.status,
        error: args.error,
      },
    });
  } catch (_) {}
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
    if (action === 'buy-cable') return await handleCable(svc, user, payload);
    if (action === 'buy-electricity') return await handleElectricity(svc, user, payload);
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
  if (['MTN', 'GLO', 'AIRTEL', '9MOBILE'].indexOf(network) === -1) {
    return fail('Selected network is not supported. Please try another network.');
  }
  if (!Number.isFinite(amount) || amount < 50 || amount > 1000000) {
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
      _meta: { network: network, phone: phone, product_amount: amount, charge: charge },
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
  for (let i = 0; i < providersOrder.length; i++) {
    const provider = providersOrder[i];
    const r = await providerBuyAirtime(provider, network, phone, amount);
    attempts.push({ provider: provider, result: r });
    await logApi(svc, {
      user_id: user.id,
      provider: provider,
      endpoint: 'buy-airtime',
      request: { network: network, phone: phone, amount: amount },
      response: r.body,
      status: r.status,
      error: r.error,
    });
    finalResult = r;
    finalProvider = provider;
    if (r.ok) break;
  }

  if (!finalResult) {
    await svc.rpc('release_wallet_hold', {
      _hold_id: holdId,
      _reason: 'no-provider-response',
    });
    tg('Airtime Failed', '❌', {
      User: user.email || user.id,
      Network: network,
      Phone: phone,
      Amount: 'NGN' + amount,
      Provider: lastProvider(attempts),
      'Provider error': lastError(attempts),
      Attempts: formatAttempts(attempts),
      Refunded: 'yes (hold released)',
    });
    return fail('Service temporarily unavailable. Please try again later.', { refunded: true });
  }

  if (finalResult.ok) {
    const { data: tx, error: cErr } = await svc.rpc('commit_wallet_hold', {
      _hold_id: holdId,
      _type: 'airtime',
      _description: network + ' airtime NGN' + amount + ' to ' + phone,
      _meta: {
        network: network,
        phone: phone,
        product_amount: amount,
        cost_price: amount,
        charge: charge,
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
      Amount: 'NGN' + amount,
      Cashback: cashback > 0 ? 'NGN' + cashback : '0',
      Retries: attempts.length - 1,
      Reference: finalResult.reference || '-',
    });

    return ok({
      tx_id: txId,
      charge: charge,
      total: total,
      cashback: cashback,
      provider: finalProvider,
      retries: attempts.length - 1,
      response: finalResult.body,
    });
  }

  await svc.rpc('release_wallet_hold', {
    _hold_id: holdId,
    _reason: finalResult.error || 'provider-failed',
  });

  tg('Airtime Failed', '❌', {
    User: user.email || user.id,
    Network: network,
    Phone: phone,
    Amount: 'NGN' + amount,
    Provider: lastProvider(attempts),
    'Provider error': lastError(attempts),
    'HTTP status': finalResult.status || '-',
    Attempts: formatAttempts(attempts),
    Refunded: 'yes (hold released)',
  });

  return fail(userSafeError(finalResult.error), {
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

  const primaryProvider = String(plan.provider || plan.supplier || 'smeapi').toLowerCase();
  let network = normalizeNetwork(String(plan.network || ''), primaryProvider);
  if (['MTN', 'GLO', 'AIRTEL', '9MOBILE'].indexOf(network) === -1) {
    network = inferNetwork(plan.plan_name, plan.data_size, plan.description);
  }
  if (['MTN', 'GLO', 'AIRTEL', '9MOBILE'].indexOf(network) === -1) {
    console.error('[vtu-purchase] unresolved network', {
      plan_id: plan.id,
      raw_network: plan.network,
      provider: primaryProvider,
    });
    return fail('Selected network is not supported. Please try another network.');
  }

  const primaryPlanCode = String(plan.plan_id || plan.api_code || '').trim();
  if (!primaryPlanCode) {
    return fail('Selected plan is not available. Please choose another plan.');
  }

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
        network: network,
        phone: phone,
        product_amount: sellingPrice,
        charge: charge,
      },
    });
    if (error) throw error;
    holdId = data as string;
  } catch (e: any) {
    return fail(userSafeError(e?.message));
  }

  const secondaryProvider = primaryProvider === 'smeapi' ? 'smeplug' : 'smeapi';

  const { data: alt } = await svc
    .from('data_plans')
    .select('*')
    .eq('provider', secondaryProvider)
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
    { provider: primaryProvider, providerPlanId: primaryPlanCode },
  ];
  if (alt && String(alt.plan_id || alt.api_code || '').trim()) {
    tryList.push({
      provider: secondaryProvider,
      providerPlanId: String(alt.plan_id || alt.api_code || ''),
    });
  }

  for (let i = 0; i < tryList.length; i++) {
    const t = tryList[i];
    const r = await providerBuyData(t.provider, network, t.providerPlanId, phone);
    attempts.push({ provider: t.provider, result: r, plan_id: t.providerPlanId });
    await logApi(svc, {
      user_id: user.id,
      provider: t.provider,
      endpoint: 'buy-data',
      request: { network: network, plan_id: t.providerPlanId, phone: phone },
      response: r.body,
      status: r.status,
      error: r.error,
    });
    finalResult = r;
    finalProvider = t.provider;
    finalProviderPlanId = t.providerPlanId;
    if (r.ok) break;
  }

  if (!finalResult) {
    await svc.rpc('release_wallet_hold', {
      _hold_id: holdId,
      _reason: 'no-provider-response',
    });
    tg('Data Failed', '❌', {
      User: user.email || user.id,
      Network: network,
      Phone: phone,
      Plan: String(plan.data_size || '') + ' / ' + String(plan.validity || ''),
      Provider: lastProvider(attempts),
      'Provider error': lastError(attempts),
      Attempts: formatAttempts(attempts),
      Refunded: 'yes (hold released)',
    });
    return fail('Service temporarily unavailable. Please try again later.', { refunded: true });
  }

  if (finalResult.ok) {
    const costPrice = Number(plan.cost_price || 0);
    const dataProfit = Math.max(0, sellingPrice - costPrice);

    const { data: tx, error: cErr } = await svc.rpc('commit_wallet_hold', {
      _hold_id: holdId,
      _type: 'data',
      _description:
        network +
        ' ' +
        String(plan.data_size || '') +
        ' / ' +
        String(plan.validity || '') +
        ' to ' +
        phone,
      _meta: {
        plan_id: plan.id,
        network: network,
        phone: phone,
        product_amount: sellingPrice,
        cost_price: costPrice,
        charge: charge,
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

    tg('Data Success', '✅', {
      Provider: finalProvider,
      User: user.email || user.id,
      Network: network,
      Phone: phone,
      Plan: String(plan.data_size || '') + ' / ' + String(plan.validity || ''),
      Amount: 'NGN' + sellingPrice,
      Cashback: cashback > 0 ? 'NGN' + cashback : '0',
      Retries: attempts.length - 1,
    });

    return ok({
      tx_id: txId,
      charge: charge,
      total: total,
      cashback: cashback,
      provider: finalProvider,
      retries: attempts.length - 1,
      response: finalResult.body,
    });
  }

  await svc.rpc('release_wallet_hold', {
    _hold_id: holdId,
    _reason: finalResult.error || 'provider-failed',
  });

  tg('Data Failed', '❌', {
    User: user.email || user.id,
    Network: network,
    Phone: phone,
    Plan: String(plan.data_size || '') + ' / ' + String(plan.validity || ''),
    Provider: lastProvider(attempts),
    'Provider error': lastError(attempts),
    'HTTP status': finalResult.status || '-',
    Attempts: formatAttempts(attempts),
    Refunded: 'yes (hold released)',
  });

  return fail(userSafeError(finalResult.error), {
    refunded: true,
  });
}


async function handleCable(svc: any, user: { id: string; email?: string }, p: any) {
  const provider = String(p.provider || '').trim();
  const plan = String(p.plan || '').trim();
  const smartcard = String(p.smart_card_number || '').trim();
  const amount = Number(p.amount);

  if (!provider || !plan) return fail('Please select a cable provider and package.');
  if (!/^\d{10,12}$/.test(smartcard)) return fail('Enter a valid smartcard / IUC number.');
  if (!Number.isFinite(amount) || amount <= 0) return fail('Invalid amount. Please check and try again.');

  const charge = await getServiceCharge(svc, 'cable', amount);
  const total = amount + charge;

  let holdId: string;
  try {
    const { data, error } = await svc.rpc('create_wallet_hold', {
      _user_id: user.id,
      _amount: total,
      _purpose: 'cable',
      _meta: { provider: provider, plan: plan, smartcard: smartcard, product_amount: amount, charge: charge },
    });
    if (error) throw error;
    holdId = data as string;
  } catch (e: any) {
    return fail(userSafeError(e?.message));
  }

  const r = await callSmeapi('/cablesub', {
    cablename: provider,
    cableplan: plan,
    smart_card_number: smartcard,
    pin: SMEAPI_PIN,
  });
  await logApi(svc, {
    user_id: user.id,
    provider: 'smeapi',
    endpoint: 'buy-cable',
    request: { provider: provider, plan: plan, smart_card_number: smartcard, amount: amount },
    response: r.body,
    status: r.status,
    error: r.error,
  });

  if (!r.ok) {
    await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: r.error || 'provider-failed' });
    tg('Cable Failed', '❌', {
      User: user.email || user.id,
      Provider: 'smeapi',
      Package: provider + ' ' + plan,
      Smartcard: smartcard,
      Amount: 'NGN' + amount,
      'Provider error': r.error || 'Unknown provider error',
      'HTTP status': r.status || '-',
      Refunded: 'yes (hold released)',
    });
    return fail(userSafeError(r.error), { refunded: true });
  }

  const { data: tx, error: cErr } = await svc.rpc('commit_wallet_hold', {
    _hold_id: holdId,
    _type: 'cable',
    _description: provider + ' ' + plan + ' on ' + smartcard,
    _meta: {
      provider: 'smeapi',
      cable_provider: provider,
      plan: plan,
      smartcard: smartcard,
      product_amount: amount,
      charge: charge,
      supplier_reference: r.reference,
      provider_response: r.body,
    },
  });
  if (cErr) {
    await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: 'commit-failed' });
    return fail('Transaction failed. Please try again.');
  }

  const txId = (tx as any)?.id || null;
  const cashback = await awardCashbackIfAny(svc, user.id, 'cable', amount, txId);

  tg('Cable Success', '✅', {
    Provider: 'smeapi',
    User: user.email || user.id,
    Package: provider + ' ' + plan,
    Smartcard: smartcard,
    Amount: 'NGN' + amount,
    Reference: r.reference || '-',
  });

  return ok({
    tx_id: txId,
    charge: charge,
    total: total,
    cashback: cashback,
    provider: 'smeapi',
    response: r.body,
  });
}

async function handleElectricity(svc: any, user: { id: string; email?: string }, p: any) {
  const disco = String(p.disco || '').trim();
  const meter = String(p.meter_number || '').trim();
  const meterType = String(p.meter_type || 'PREPAID').toUpperCase() === 'POSTPAID' ? 'POSTPAID' : 'PREPAID';
  const amount = Number(p.amount);

  if (!disco) return fail('Please select a disco.');
  if (!/^\d{10,13}$/.test(meter)) return fail('Enter a valid meter number.');
  if (!Number.isFinite(amount) || amount < 500) return fail('Invalid amount. Please check and try again.');

  const charge = await getServiceCharge(svc, 'electricity', amount);
  const total = amount + charge;

  let holdId: string;
  try {
    const { data, error } = await svc.rpc('create_wallet_hold', {
      _user_id: user.id,
      _amount: total,
      _purpose: 'electricity',
      _meta: { disco: disco, meter: meter, meter_type: meterType, product_amount: amount, charge: charge },
    });
    if (error) throw error;
    holdId = data as string;
  } catch (e: any) {
    return fail(userSafeError(e?.message));
  }

  const r = await callSmeapi('/billpayment', {
    disco_name: disco,
    meter_number: meter,
    MeterType: meterType,
    amount: amount,
    pin: SMEAPI_PIN,
  });
  await logApi(svc, {
    user_id: user.id,
    provider: 'smeapi',
    endpoint: 'buy-electricity',
    request: { disco: disco, meter_number: meter, meter_type: meterType, amount: amount },
    response: r.body,
    status: r.status,
    error: r.error,
  });

  if (!r.ok) {
    await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: r.error || 'provider-failed' });
    tg('Electricity Failed', '❌', {
      User: user.email || user.id,
      Provider: 'smeapi',
      Disco: disco,
      Meter: meter + ' (' + meterType + ')',
      Amount: 'NGN' + amount,
      'Provider error': r.error || 'Unknown provider error',
      'HTTP status': r.status || '-',
      Refunded: 'yes (hold released)',
    });
    return fail(userSafeError(r.error), { refunded: true });
  }

  const token = r.body?.token || r.body?.Token || r.body?.data?.token || null;

  const { data: tx, error: cErr } = await svc.rpc('commit_wallet_hold', {
    _hold_id: holdId,
    _type: 'electricity',
    _description: disco + ' ' + meterType + ' NGN' + amount + ' • ' + meter,
    _meta: {
      provider: 'smeapi',
      disco: disco,
      meter: meter,
      meter_type: meterType,
      token: token,
      product_amount: amount,
      charge: charge,
      supplier_reference: r.reference,
      provider_response: r.body,
    },
  });
  if (cErr) {
    await svc.rpc('release_wallet_hold', { _hold_id: holdId, _reason: 'commit-failed' });
    return fail('Transaction failed. Please try again.');
  }

  const txId = (tx as any)?.id || null;
  const cashback = await awardCashbackIfAny(svc, user.id, 'electricity', amount, txId);

  tg('Electricity Success', '✅', {
    Provider: 'smeapi',
    User: user.email || user.id,
    Disco: disco,
    Meter: meter + ' (' + meterType + ')',
    Amount: 'NGN' + amount,
    Token: token || '-',
  });

  return ok({
    tx_id: txId,
    charge: charge,
    total: total,
    cashback: cashback,
    token: token,
    provider: 'smeapi',
    response: r.body,
  });
}
