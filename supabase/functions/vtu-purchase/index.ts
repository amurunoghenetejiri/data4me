// DATA4ME — VTU Purchase Edge Function
// PROVIDER: SME Plug (https://smeplug.ng/api/v1)
//
// Guarantees:
//  • Wallet balance is checked, then debited ONCE via `debit_wallet` RPC.
//  • Provider response is verified; only CONFIRMED failures auto-refund.
//    Ambiguous responses (timeouts / 5xx) are left `pending` for manual review.
//  • All lifecycle events are logged.
//
// Actions:
//   buy-airtime      { network, phone, amount }
//   buy-data         { plan_id, phone }
//   buy-electricity  { disco, meter_number, meter_type, amount, phone }
//   buy-cable        { provider, smart_card_number, package_code, phone }
//   buy-exam-pin     { exam, quantity }   // exam: 'waec' | 'neco' | 'nabteb'
//
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>> CONFIGURATION: add / update these in Project Settings → Secrets:
// >>>   SMEPLUG_API_KEY   (required — get from SME Plug dashboard)
// >>>   SMEPLUG_BASE_URL  (optional — defaults to https://smeplug.ng/api/v1)
// >>> The base URL can also be edited from the Admin > SME Plug page.
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const ok = (data: any) =>
  new Response(JSON.stringify({ success: true, ...data }), { status: 200, headers: jsonHeaders });
const fail = (error: string, status = 400, extra: any = {}) =>
  new Response(JSON.stringify({ success: false, error, ...extra }), { status, headers: jsonHeaders });

// ---------- Logger ----------
function mkLogger() {
  return {
    log: (step: string, data: any = {}) => console.log(`[VTU][INFO] ${step}`, JSON.stringify(data)),
    error: (step: string, err: any, data: any = {}) =>
      console.error(`[VTU][ERROR] ${step}`, err instanceof Error ? err.message : err, JSON.stringify(data)),
  };
}
type Logger = ReturnType<typeof mkLogger>;

// ---------- Validation ----------
const validPhone = (p: string) => typeof p === 'string' && /^0\d{10}$/.test(p.trim());
const validUuid = (v: string) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// SME Plug network IDs
const SMEPLUG_NETWORK_ID: Record<string, number> = {
  MTN: 1,
  GLO: 2,
  AIRTEL: 3,
  '9MOBILE': 4,
};
const NETWORKS = Object.keys(SMEPLUG_NETWORK_ID);
const normalizeNetwork = (n: string) => {
  const u = (n || '').toUpperCase().trim();
  return NETWORKS.includes(u) ? u : null;
};

// ---------- SME Plug Client ----------
interface Config {
  supabaseUrl: string;
  serviceKey: string;
  apiKey: string;
  baseUrl: string;
}

async function loadConfig(): Promise<Config> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const apiKey = Deno.env.get('SMEPLUG_API_KEY') || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase env vars missing');
  if (!apiKey) throw new Error('SMEPLUG_API_KEY is not configured');
  // base_url from smeplug_config table if present
  const svc = createClient(supabaseUrl, serviceKey);
  const { data } = await svc
    .from('smeplug_config').select('base_url,is_active')
    .eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const baseUrl = (data?.base_url as string) || Deno.env.get('SMEPLUG_BASE_URL') || 'https://smeplug.ng/api/v1';
  return { supabaseUrl, serviceKey, apiKey, baseUrl };
}

async function smeplugPost(
  cfg: Config, logger: Logger, path: string, body: any,
): Promise<{ httpOk: boolean; status: number; body: any; networkError?: string }> {
  const url = `${cfg.baseUrl}${path}`;
  logger.log('SMEPLUG_REQUEST', { url, bodyKeys: Object.keys(body || {}) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
    logger.log('SMEPLUG_RESPONSE', { status: res.status, body: parsed });
    return { httpOk: res.ok, status: res.status, body: parsed };
  } catch (err) {
    logger.error('SMEPLUG_NETWORK_ERROR', err, { url });
    return { httpOk: false, status: 0, body: null, networkError: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

// SME Plug success shape: { status: true, msg: 'Successful', data: {...} }
function isConfirmedSuccess(r: { httpOk: boolean; status: number; body: any }): boolean {
  if (!r.httpOk || !r.body) return false;
  const b = r.body;
  if (b.status === true) return true;
  const s = String(b.status ?? '').toLowerCase();
  if (['success', 'successful', 'completed', 'delivered'].includes(s)) return true;
  return false;
}
function isConfirmedFailure(r: { httpOk: boolean; status: number; body: any; networkError?: string }): boolean {
  if (r.status >= 400 && r.status < 500) return true;
  if (!r.body) return false;
  const b = r.body;
  if (b.status === false) return true;
  const s = String(b.status ?? '').toLowerCase();
  if (['failed', 'failure', 'error', 'declined', 'rejected'].includes(s)) return true;
  if (typeof b.error === 'string' && b.error.length > 0) return true;
  return false;
}
function extractReference(body: any): string | null {
  if (!body || typeof body !== 'object') return null;
  return (
    body.data?.reference ?? body.data?.id ?? body.reference ??
    body.transaction_id ?? body.ref ?? null
  );
}

// ---------- TX lifecycle ----------
async function updateTx(svc: any, logger: Logger, txId: string, patch: Record<string, any>) {
  const { error } = await svc.from('transactions').update(patch).eq('id', txId);
  if (error) logger.error('TX_UPDATE_FAILED', error, { txId, patch });
}
async function issueRefund(svc: any, logger: Logger, txId: string, reason: string) {
  const { error } = await svc.rpc('refund_transaction', { _tx_id: txId, _reason: reason });
  if (error) { logger.error('REFUND_FAILED', error, { txId }); return false; }
  logger.log('REFUND_ISSUED', { txId, reason });
  return true;
}
async function debitWallet(
  svc: any, logger: Logger, userId: string, amount: number,
  type: string, description: string, meta: Record<string, any>,
): Promise<{ txId: string | null; error?: string }> {
  const { data, error } = await svc.rpc('debit_wallet', {
    _user_id: userId, _amount: amount, _type: type, _description: description, _meta: meta,
  });
  if (error) { logger.error('DEBIT_WALLET_ERROR', error, { userId, amount }); return { txId: null, error: error.message }; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return { txId: null, error: 'Failed to create transaction' };
  logger.log('WALLET_DEBITED', { txId: row.id, amount });
  return { txId: row.id };
}
async function checkWallet(svc: any, userId: string, need: number): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await svc.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
  if (error) return { ok: false, error: 'Failed to check wallet balance' };
  const bal = Number(data?.balance || 0);
  if (bal < need) return { ok: false, error: `Insufficient balance. Required: ₦${need}, Available: ₦${bal}` };
  return { ok: true };
}

// ---------- Unified purchase runner ----------
async function runPurchase(opts: {
  svc: any; logger: Logger; userId: string;
  txType: string; description: string; meta: Record<string, any>;
  productAmount: number; chargeAmount: number;
  path: string; payloadBuilder: (customerRef: string) => any;
  successMessage: (data: any) => string;
}) {
  const total = opts.productAmount + opts.chargeAmount;
  const balCheck = await checkWallet(opts.svc, opts.userId, total);
  if (!balCheck.ok) return { success: false, error: balCheck.error };

  const { txId, error: debitErr } = await debitWallet(
    opts.svc, opts.logger, opts.userId, total, opts.txType, opts.description,
    { ...opts.meta, product_amount: opts.productAmount, charge_amount: opts.chargeAmount },
  );
  if (!txId) return { success: false, error: debitErr };
  await updateTx(opts.svc, opts.logger, txId, { status: 'pending' });

  const customerRef = `D4M-${txId.slice(0, 8)}-${Date.now()}`;
  const cfg = await loadConfig();
  const resp = await smeplugPost(cfg, opts.logger, opts.path, opts.payloadBuilder(customerRef));

  await updateTx(opts.svc, opts.logger, txId, {
    provider_response: resp.body ?? { networkError: resp.networkError },
    supplier_reference: extractReference(resp.body) || customerRef,
  });

  if (isConfirmedSuccess(resp)) {
    await updateTx(opts.svc, opts.logger, txId, { status: 'success' });
    return {
      success: true,
      data: {
        txId,
        amount: opts.productAmount, charge: opts.chargeAmount, total,
        supplier_reference: extractReference(resp.body) || customerRef,
        message: opts.successMessage(resp.body?.data ?? resp.body),
      },
    };
  }
  if (isConfirmedFailure(resp)) {
    const reason = resp.body?.msg || resp.body?.message || resp.body?.error ||
      resp.networkError || `Provider rejected (HTTP ${resp.status})`;
    await updateTx(opts.svc, opts.logger, txId, { status: 'failed' });
    await issueRefund(opts.svc, opts.logger, txId, reason);
    return { success: false, error: reason, data: { txId, refunded: true } };
  }
  opts.logger.log('SMEPLUG_AMBIGUOUS', { txId, status: resp.status });
  return {
    success: false,
    error: 'Provider response was inconclusive. Your transaction is pending review — do not retry. If not delivered within 30 minutes it will be refunded.',
    data: { txId, pending: true },
  };
}

// ---------- Handlers ----------
async function buyAirtime(svc: any, logger: Logger, userId: string, p: any) {
  const net = normalizeNetwork(p.network);
  if (!net) return { success: false, error: `Invalid network. Supported: ${NETWORKS.join(', ')}` };
  if (!validPhone(p.phone)) return { success: false, error: 'Invalid Nigerian phone number' };
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount < 50 || amount > 500_000)
    return { success: false, error: 'Amount must be between ₦50 and ₦500,000' };

  return runPurchase({
    svc, logger, userId,
    txType: 'airtime',
    description: `${net} airtime ₦${amount} to ${p.phone.trim()}`,
    meta: { network: net, phone: p.phone.trim() },
    productAmount: amount, chargeAmount: 0,
    path: '/ng/airtime',
    payloadBuilder: (ref) => ({
      network_id: SMEPLUG_NETWORK_ID[net],
      phone: p.phone.trim(),
      amount,
      customer_reference: ref,
    }),
    successMessage: () => `✓ ₦${amount} airtime sent to ${p.phone}.`,
  });
}

async function buyData(svc: any, logger: Logger, userId: string, p: any) {
  if (!validUuid(p.plan_id)) return { success: false, error: 'Invalid plan ID' };
  if (!validPhone(p.phone)) return { success: false, error: 'Invalid Nigerian phone number' };
  const { data: plan, error } = await svc
    .from('data_plans').select('*').eq('id', p.plan_id).eq('is_active', true).maybeSingle();
  if (error || !plan) return { success: false, error: 'Data plan not found' };
  const net = normalizeNetwork(plan.network);
  if (!net) return { success: false, error: `Unsupported plan network: ${plan.network}` };
  const price = Number(plan.selling_price || 0);
  if (price <= 0) return { success: false, error: 'Invalid plan price' };
  const providerPlan = plan.api_code || plan.plan_id;
  if (!providerPlan) return { success: false, error: 'Plan is missing SME Plug mapping (api_code). Sync plans in Admin.' };

  return runPurchase({
    svc, logger, userId,
    txType: 'data',
    description: `${net} ${plan.data_size || plan.plan_name} to ${p.phone.trim()}`,
    meta: { network: net, phone: p.phone.trim(), plan_id: p.plan_id, data_size: plan.data_size },
    productAmount: price, chargeAmount: 0,
    path: '/ng/data',
    payloadBuilder: (ref) => ({
      network_id: SMEPLUG_NETWORK_ID[net],
      plan_id: Number(providerPlan) || providerPlan,
      phone: p.phone.trim(),
      customer_reference: ref,
    }),
    successMessage: () => `✓ ${plan.data_size || 'Data plan'} delivered to ${p.phone}.`,
  });
}

async function buyElectricity(svc: any, logger: Logger, userId: string, p: any) {
  const amount = Number(p.amount);
  if (!p.disco) return { success: false, error: 'disco is required' };
  if (!p.meter_number) return { success: false, error: 'meter_number is required' };
  if (!Number.isFinite(amount) || amount < 100) return { success: false, error: 'Amount must be ≥ ₦100' };

  return runPurchase({
    svc, logger, userId,
    txType: 'electricity',
    description: `${p.disco} meter ${p.meter_number} — ₦${amount}`,
    meta: { disco: p.disco, meter_number: p.meter_number, meter_type: p.meter_type || 'PREPAID' },
    productAmount: amount, chargeAmount: 0,
    path: '/networks/electric/vend',
    payloadBuilder: (ref) => ({
      disco_name: p.disco,
      meter_number: p.meter_number,
      meter_type: p.meter_type || 'PREPAID',
      amount,
      customer_reference: ref,
    }),
    successMessage: (d) => d?.token ? `✓ Token: ${d.token}` : `✓ Electricity purchase successful.`,
  });
}

async function buyCable(svc: any, logger: Logger, userId: string, p: any) {
  if (!p.provider) return { success: false, error: 'provider is required' };
  if (!p.smart_card_number) return { success: false, error: 'smart_card_number is required' };
  if (!p.package_code) return { success: false, error: 'package_code is required' };
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'Amount required' };

  return runPurchase({
    svc, logger, userId,
    txType: 'cable',
    description: `${p.provider} ${p.package_code} — ${p.smart_card_number}`,
    meta: { provider: p.provider, smart_card_number: p.smart_card_number, package_code: p.package_code },
    productAmount: amount, chargeAmount: 0,
    path: '/networks/tv/vend',
    payloadBuilder: (ref) => ({
      cable_name: p.provider,
      smart_card_number: p.smart_card_number,
      package: p.package_code,
      customer_reference: ref,
    }),
    successMessage: () => `✓ Cable subscription successful.`,
  });
}

async function buyExamPin(svc: any, logger: Logger, userId: string, p: any) {
  const exam = String(p.exam || '').toLowerCase();
  const qty = Number(p.quantity || 1);
  if (!['waec', 'neco', 'nabteb'].includes(exam)) return { success: false, error: 'exam must be waec, neco or nabteb' };
  if (!Number.isFinite(qty) || qty < 1 || qty > 20) return { success: false, error: 'quantity 1-20' };
  const unit = Number(p.unit_price);
  if (!Number.isFinite(unit) || unit <= 0) return { success: false, error: 'unit_price required' };
  const amount = unit * qty;

  return runPurchase({
    svc, logger, userId,
    txType: 'exam_pin',
    description: `${exam.toUpperCase()} pin x${qty}`,
    meta: { exam, quantity: qty },
    productAmount: amount, chargeAmount: 0,
    path: '/ng/education',
    payloadBuilder: (ref) => ({ type: exam, quantity: qty, customer_reference: ref }),
    successMessage: (d) => d?.pins ? `✓ Pins: ${JSON.stringify(d.pins)}` : `✓ Exam pin purchase successful.`,
  });
}

// ---------- Main ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = mkLogger();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return fail('Server misconfigured', 500);
  if (!Deno.env.get('SMEPLUG_API_KEY')) return fail('SMEPLUG_API_KEY not configured', 500);
  const svc = createClient(supabaseUrl, serviceKey);

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return fail('Authentication required', 401);
  const { data: u, error: authErr } = await svc.auth.getUser(token);
  if (authErr || !u?.user?.id) return fail('Invalid session', 401);
  const userId = u.user.id;

  let payload: any;
  try { payload = await req.json(); } catch { return fail('Invalid JSON', 400); }
  const action = payload?.action;

  try {
    let result;
    switch (action) {
      case 'buy-airtime':     result = await buyAirtime(svc, logger, userId, payload); break;
      case 'buy-data':        result = await buyData(svc, logger, userId, payload); break;
      case 'buy-electricity': result = await buyElectricity(svc, logger, userId, payload); break;
      case 'buy-cable':       result = await buyCable(svc, logger, userId, payload); break;
      case 'buy-exam-pin':    result = await buyExamPin(svc, logger, userId, payload); break;
      default: return fail(`Unknown action: ${action}`, 400);
    }
    return result.success ? ok(result.data) : fail(result.error || 'Purchase failed', 400, { data: result.data });
  } catch (err) {
    logger.error('UNHANDLED', err);
    return fail('An unexpected error occurred', 500);
  }
});
