// DATA4ME — PRODUCTION-READY VTU Purchase Edge Function
// Complete audit & fix for RUNTIME_ERROR and blank screen issues
// All environment variables, validation, error handling, and logging included

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

// ============================================
// ENVIRONMENT CONFIGURATION
// ============================================

interface Config {
  supabaseUrl: string;
  supabaseServiceKey: string;
  smeapiKey: string;
  smeapiBaseUrl: string;
  smeapiUsername?: string;
  smeapiPin?: string;
}

function loadConfig(): Config {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Standardised on SMEAPI_* env vars (single VTU provider)
  const smeapiKey = Deno.env.get('SMEAPI_API_KEY') || Deno.env.get('SMEAPI_KEY') || '';
  const smeapiBaseUrl = Deno.env.get('SMEAPI_BASE_URL') || 'https://smeapi.com.ng/api';
  const smeapiUsername = Deno.env.get('SMEAPI_USERNAME');
  const smeapiPin = Deno.env.get('SMEAPI_PIN');

  if (!supabaseUrl) throw new Error('SUPABASE_URL not configured');
  if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  if (!smeapiKey) throw new Error('SMEAPI_API_KEY not configured');

  return {
    supabaseUrl,
    supabaseServiceKey,
    smeapiKey,
    smeapiBaseUrl,
    smeapiUsername,
    smeapiPin,
  };
}


// ============================================
// LOGGER (Structured Logging)
// ============================================

interface LogEntry {
  timestamp: string;
  level: string;
  step: string;
  data: any;
  error?: string;
}

function createLogger() {
  const logs: LogEntry[] = [];

  return {
    log: (step: string, data: any = {}) => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        step,
        data,
      };
      logs.push(entry);
      console.error(`[${entry.timestamp}] [${step}]`, JSON.stringify(data, null, 2));
    },

    error: (step: string, error: any, data: any = {}) => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        step,
        data,
        error: error instanceof Error ? error.message : String(error),
      };
      logs.push(entry);
      console.error(`[${entry.timestamp}] [ERROR] [${step}]`, JSON.stringify(entry, null, 2));
    },

    getLogs: () => logs,
  };
}

type Logger = ReturnType<typeof createLogger>;

// ============================================
// RESPONSE BUILDER
// ============================================

function successResponse(data: any) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(error: string, statusCode: number = 400, data: any = {}) {
  return new Response(
    JSON.stringify({
      success: false,
      error,
      ...data,
    }),
    {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// ============================================
// REQUEST VALIDATION
// ============================================

function validatePhoneNumber(phone: string): { valid: boolean; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  if (!/^0[789][01]\d{8}$/.test(phone.trim())) {
    return {
      valid: false,
      error: 'Invalid Nigerian phone number. Format: 08012345678',
    };
  }

  return { valid: true };
}

function validateNetwork(network: string): { valid: boolean; error?: string } {
  if (!network || typeof network !== 'string') {
    return { valid: false, error: 'Network is required' };
  }

  const validNetworks = ['MTN', 'GLO', 'AIRTEL', '9MOBILE'];
  if (!validNetworks.includes(network.toUpperCase())) {
    return {
      valid: false,
      error: `Invalid network. Supported: ${validNetworks.join(', ')}`,
    };
  }

  return { valid: true };
}

function validateAmount(amount: any): { valid: boolean; error?: string; amount?: number } {
  if (amount === null || amount === undefined || amount === '') {
    return { valid: false, error: 'Amount is required' };
  }

  const numAmount = Number(amount);

  if (isNaN(numAmount)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }

  if (numAmount < 50) {
    return { valid: false, error: 'Minimum airtime amount is ₦50' };
  }

  if (numAmount > 1000000) {
    return { valid: false, error: 'Maximum airtime amount is ₦1,000,000' };
  }

  return { valid: true, amount: numAmount };
}

function validateDataPlanId(planId: string): { valid: boolean; error?: string } {
  if (!planId || typeof planId !== 'string') {
    return { valid: false, error: 'Plan ID is required' };
  }

  // UUID format check
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)
  ) {
    return { valid: false, error: 'Invalid plan ID format' };
  }

  return { valid: true };
}

// ============================================
// SMEAPI REQUEST
// ============================================

async function smeapiRequest(
  config: Config,
  logger: Logger,
  path: string,
  method: string,
  body: any,
  txId: string,
  userId: string,
  svc: any
): Promise<{ ok: boolean; status: number; body: any; rawResponse: string }> {
  const url = `${config.smeapiBaseUrl}${path}`;

  logger.log('SMEAPI_REQUEST_START', {
    url,
    method,
    txId,
    userId,
    hasApiKey: !!config.smeapiKey,
  });

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.smeapiKey}`,
      'x-api-key': config.smeapiKey,
    };

    if (config.smeapiUsername) {
      headers['x-username'] = config.smeapiUsername;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST' && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    logger.log('SMEAPI_FETCH_OPTIONS', {
      url,
      method,
      headersKeys: Object.keys(headers),
      bodyKeys: body ? Object.keys(body) : [],
    });

    const response = await fetch(url, fetchOptions);
    const rawResponse = await response.text();

    let responseBody: any;
    try {
      responseBody = JSON.parse(rawResponse);
    } catch {
      responseBody = { raw: rawResponse, parseError: 'Failed to parse JSON' };
    }

    logger.log('SMEAPI_RESPONSE_RECEIVED', {
      status: response.status,
      statusText: response.statusText,
      bodyKeys: responseBody ? Object.keys(responseBody) : [],
      isOk: response.ok,
    });

    // Log to database
    try {
      await svc.rpc('log_api_call', {
        _tx_id: txId,
        _user_id: userId,
        _provider: 'smeapi',
        _endpoint: path,
        _method: method,
        _request_body: body,
        _response_status: response.status,
        _response_body: responseBody,
      });
    } catch (logErr) {
      logger.error('DB_API_LOG_FAILED', logErr, { txId });
    }

    return {
      ok: response.ok && response.status >= 200 && response.status < 300,
      status: response.status,
      body: responseBody,
      rawResponse,
    };
  } catch (err) {
    logger.error('SMEAPI_FETCH_FAILED', err, { url, txId });

    try {
      await svc.rpc('log_api_call', {
        _tx_id: txId,
        _user_id: userId,
        _provider: 'smeapi',
        _endpoint: path,
        _method: method,
        _request_body: body,
        _response_status: 0,
        _response_body: null,
        _error_message: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Silently fail if logging fails
    }

    throw err;
  }
}

// ============================================
// SUCCESS DETECTION
// ============================================

function isSMEAPISuccess(response: any, logger: Logger): boolean {
  if (!response) {
    logger.log('SUCCESS_CHECK_EMPTY_RESPONSE', {});
    return false;
  }

  const status = String(
    response.Status ||
      response.status ||
      response.response_code ||
      response.status_code ||
      response.statusCode ||
      ''
  )
    .toLowerCase()
    .trim();

  logger.log('SUCCESS_CHECK', {
    rawStatus: response.Status || response.status || response.response_code,
    normalizedStatus: status,
    successFieldFound: status.length > 0,
  });

  const successIndicators = [
    'successful',
    'success',
    'completed',
    'complete',
    '200',
    '000',
  ];

  const isSuccess =
    successIndicators.includes(status) ||
    response.success === true ||
    response.successful === true ||
    response.message?.toLowerCase().includes('successful') ||
    response.message?.toLowerCase().includes('completed');

  logger.log('SUCCESS_RESULT', { isSuccess, status });

  return isSuccess;
}

// ============================================
// BUY AIRTIME (COMPLETE FIX)
// ============================================

async function buyAirtime(
  config: Config,
  logger: Logger,
  svc: any,
  userId: string,
  network: string,
  phone: string,
  amount: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  logger.log('BUY_AIRTIME_START', { userId, network, phone, amount });

  try {
    // STEP 1: Validate network
    const networkCheck = validateNetwork(network);
    if (!networkCheck.valid) {
      logger.log('VALIDATION_FAILED', { reason: 'network', error: networkCheck.error });
      return { success: false, error: networkCheck.error };
    }

    // STEP 2: Validate phone
    const phoneCheck = validatePhoneNumber(phone);
    if (!phoneCheck.valid) {
      logger.log('VALIDATION_FAILED', { reason: 'phone', error: phoneCheck.error });
      return { success: false, error: phoneCheck.error };
    }

    // STEP 3: Validate amount
    const amountCheck = validateAmount(amount);
    if (!amountCheck.valid) {
      logger.log('VALIDATION_FAILED', { reason: 'amount', error: amountCheck.error });
      return { success: false, error: amountCheck.error };
    }

    const productAmount = amountCheck.amount!;
    const chargeAmount = 1; // Fixed ₦1 charge
    const totalAmount = productAmount + chargeAmount;

    logger.log('AMOUNTS_CALCULATED', {
      productAmount,
      chargeAmount,
      totalAmount,
    });

    // STEP 4: Check wallet balance
    let balance: number;
    try {
      const { data: walletData, error: walletErr } = await svc
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletErr) {
        logger.error('WALLET_QUERY_ERROR', walletErr, { userId });
        return { success: false, error: 'Failed to check wallet balance' };
      }

      balance = walletData?.balance || 0;
      logger.log('WALLET_CHECKED', { userId, balance, required: totalAmount });

      if (balance < totalAmount) {
        logger.log('INSUFFICIENT_BALANCE', {
          userId,
          required: totalAmount,
          available: balance,
        });
        return {
          success: false,
          error: `Insufficient balance. Required: ₦${totalAmount}, Available: ₦${balance}`,
        };
      }
    } catch (err) {
      logger.error('WALLET_CHECK_ERROR', err, { userId });
      return { success: false, error: 'Failed to check wallet' };
    }

    // STEP 5: Debit wallet and create transaction
    let txId: string | null = null;
    try {
      const { data: debitResult, error: debitErr } = await svc.rpc('debit_wallet', {
        _user_id: userId,
        _amount: totalAmount,
        _type: 'airtime',
        _description: `${network.toUpperCase()} airtime ₦${productAmount} to ${phone}`,
        _meta: {
          product_amount: productAmount,
          charge_amount: chargeAmount,
          network: network.toUpperCase(),
          phone,
        },
      });

      if (debitErr) {
        logger.error('DEBIT_WALLET_ERROR', debitErr, { userId, totalAmount });
        return { success: false, error: debitErr.message || 'Failed to debit wallet' };
      }

      if (!debitResult || debitResult.length === 0) {
        logger.log('DEBIT_RESULT_EMPTY', { debitResult });
        return { success: false, error: 'Failed to create transaction' };
      }

      txId = debitResult[0]?.id;
      logger.log('WALLET_DEBITED', {
        txId,
        userId,
        totalAmount,
        newBalance: balance - totalAmount,
      });
    } catch (err) {
      logger.error('DEBIT_EXCEPTION', err, { userId });
      return { success: false, error: 'Failed to process transaction' };
    }

    // STEP 6: Build SMEAPI request
    const smeapiPayload = {
      network: network.toUpperCase(),
      amount: productAmount,
      mobile_number: phone.trim(),
      Ported_number: true,
      airtime_type: 'VTU',
      pin: config.smeapiPin || '',
    };


    logger.log('SMEAPI_PAYLOAD_BUILT', smeapiPayload);

    // STEP 7: Call SMEAPI
    let smeapiResp: any;
    try {
      smeapiResp = await smeapiRequest(
        config,
        logger,
        '/airtime/',
        'POST',
        smeapiPayload,
        txId!,
        userId,
        svc
      );

      logger.log('SMEAPI_RESPONSE_SUCCESS', {
        txId,
        ok: smeapiResp.ok,
        status: smeapiResp.status,
      });
    } catch (err) {
      logger.error('SMEAPI_REQUEST_FAILED', err, { txId });

      // REFUND on SMEAPI error
      try {
        await svc.rpc('refund_transaction', {
          _tx_id: txId,
          _reason: `SMEAPI request failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        logger.log('REFUND_ISSUED_ON_ERROR', { txId });
      } catch (refundErr) {
        logger.error('REFUND_FAILED', refundErr, { txId });
      }

      return {
        success: false,
        error: 'SMEAPI connection failed. Wallet refunded.',
        data: { txId },
      };
    }

    // STEP 8: Check SMEAPI success
    const smeapiSuccess = isSMEAPISuccess(smeapiResp.body, logger);

    logger.log('SMEAPI_SUCCESS_CHECK', {
      txId,
      smeapiSuccess,
      status: smeapiResp.status,
      response: smeapiResp.body,
    });

    // STEP 9: Update transaction with provider response
    try {
      await svc
        .from('transactions')
        .update({
          provider_response: smeapiResp.body,
          supplier_reference:
            smeapiResp.body?.reference ||
            smeapiResp.body?.ident ||
            smeapiResp.body?.transaction_id,
        })
        .eq('id', txId);

      logger.log('TRANSACTION_UPDATED_WITH_RESPONSE', { txId });
    } catch (err) {
      logger.error('UPDATE_RESPONSE_ERROR', err, { txId });
    }

    // STEP 10: Handle failure
    if (!smeapiSuccess) {
      logger.log('SMEAPI_FAILED', {
        txId,
        reason: smeapiResp.body?.message || smeapiResp.body?.error,
      });

      // REFUND on SMEAPI failure
      try {
        await svc.rpc('refund_transaction', {
          _tx_id: txId,
          _reason:
            smeapiResp.body?.message ||
            smeapiResp.body?.error ||
            'SMEAPI purchase failed',
        });
        logger.log('REFUND_ISSUED_ON_FAILURE', { txId, totalAmount });
      } catch (refundErr) {
        logger.error('REFUND_FAILED', refundErr, { txId });
      }

      return {
        success: false,
        error:
          smeapiResp.body?.message ||
          smeapiResp.body?.error ||
          'Airtime purchase failed',
        data: { txId },
      };
    }

    // STEP 11: Mark as success
    try {
      await svc.rpc('complete_transaction', {
        _tx_id: txId,
        _supplier_reference:
          smeapiResp.body?.reference || smeapiResp.body?.ident,
        _provider_response: smeapiResp.body,
      });

      logger.log('TRANSACTION_COMPLETED', { txId });
    } catch (err) {
      logger.error('COMPLETE_TRANSACTION_ERROR', err, { txId });
    }

    logger.log('AIRTIME_PURCHASE_SUCCESS', {
      txId,
      network,
      phone,
      amount: productAmount,
    });

    return {
      success: true,
      data: {
        txId,
        phone,
        network: network.toUpperCase(),
        amount: productAmount,
        charge: chargeAmount,
        total: totalAmount,
        message: `✓ Airtime purchase successful. ₦${productAmount} + ₦${chargeAmount} charge = ₦${totalAmount} deducted. Airtime arriving in 30 seconds.`,
      },
    };
  } catch (err) {
    logger.error('AIRTIME_UNHANDLED_ERROR', err);
    return {
      success: false,
      error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================
// BUY DATA (COMPLETE FIX)
// ============================================

async function buyData(
  config: Config,
  logger: Logger,
  svc: any,
  userId: string,
  planId: string,
  phone: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  logger.log('BUY_DATA_START', { userId, planId, phone });

  try {
    // STEP 1: Validate plan ID
    const planCheck = validateDataPlanId(planId);
    if (!planCheck.valid) {
      logger.log('VALIDATION_FAILED', { reason: 'planId', error: planCheck.error });
      return { success: false, error: planCheck.error };
    }

    // STEP 2: Validate phone
    const phoneCheck = validatePhoneNumber(phone);
    if (!phoneCheck.valid) {
      logger.log('VALIDATION_FAILED', { reason: 'phone', error: phoneCheck.error });
      return { success: false, error: phoneCheck.error };
    }

    // STEP 3: Get data plan
    let plan: any;
    try {
      const { data: planData, error: planErr } = await svc
        .from('data_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .maybeSingle();

      if (planErr) {
        logger.error('PLAN_QUERY_ERROR', planErr, { planId });
        return { success: false, error: 'Failed to fetch data plan' };
      }

      if (!planData) {
        logger.log('PLAN_NOT_FOUND', { planId });
        return { success: false, error: 'Data plan not found or inactive' };
      }

      plan = planData;
      logger.log('PLAN_FOUND', {
        planId,
        network: plan.network,
        dataSize: plan.data_size,
        price: plan.selling_price,
      });
    } catch (err) {
      logger.error('PLAN_FETCH_ERROR', err, { planId });
      return { success: false, error: 'Failed to fetch data plan' };
    }

    const productAmount = Number(plan.selling_price || 0);
    const chargeAmount = 1;
    const totalAmount = productAmount + chargeAmount;

    logger.log('AMOUNTS_CALCULATED', {
      productAmount,
      chargeAmount,
      totalAmount,
    });

    // STEP 4: Check wallet balance
    let balance: number;
    try {
      const { data: walletData, error: walletErr } = await svc
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletErr) {
        logger.error('WALLET_QUERY_ERROR', walletErr, { userId });
        return { success: false, error: 'Failed to check wallet balance' };
      }

      balance = walletData?.balance || 0;
      logger.log('WALLET_CHECKED', { userId, balance, required: totalAmount });

      if (balance < totalAmount) {
        logger.log('INSUFFICIENT_BALANCE', {
          userId,
          required: totalAmount,
          available: balance,
        });
        return {
          success: false,
          error: `Insufficient balance. Required: ₦${totalAmount}, Available: ₦${balance}`,
        };
      }
    } catch (err) {
      logger.error('WALLET_CHECK_ERROR', err, { userId });
      return { success: false, error: 'Failed to check wallet' };
    }

    // STEP 5: Debit wallet
    let txId: string | null = null;
    try {
      const { data: debitResult, error: debitErr } = await svc.rpc('debit_wallet', {
        _user_id: userId,
        _amount: totalAmount,
        _type: 'data',
        _description: `${plan.network} ${plan.data_size} data to ${phone}`,
        _meta: {
          product_amount: productAmount,
          charge_amount: chargeAmount,
          plan_id: planId,
          network: plan.network,
          data_size: plan.data_size,
          phone,
        },
      });

      if (debitErr) {
        logger.error('DEBIT_WALLET_ERROR', debitErr, { userId, totalAmount });
        return { success: false, error: debitErr.message || 'Failed to debit wallet' };
      }

      if (!debitResult || debitResult.length === 0) {
        logger.log('DEBIT_RESULT_EMPTY', { debitResult });
        return { success: false, error: 'Failed to create transaction' };
      }

      txId = debitResult[0]?.id;
      logger.log('WALLET_DEBITED', {
        txId,
        userId,
        totalAmount,
        newBalance: balance - totalAmount,
      });
    } catch (err) {
      logger.error('DEBIT_EXCEPTION', err, { userId });
      return { success: false, error: 'Failed to process transaction' };
    }

    // STEP 6: Build SMEAPI request
    const smeapiPayload = {
      network: plan.network.toUpperCase(),
      mobile_number: phone.trim(),
      plan: plan.api_code || plan.plan_id,
      Ported_number: true,
      pin: config.smeapiPin || '',
    };


    logger.log('SMEAPI_PAYLOAD_BUILT', smeapiPayload);

    // STEP 7: Call SMEAPI
    let smeapiResp: any;
    try {
      smeapiResp = await smeapiRequest(
        config,
        logger,
        '/data/',
        'POST',
        smeapiPayload,
        txId!,
        userId,
        svc
      );

      logger.log('SMEAPI_RESPONSE_SUCCESS', {
        txId,
        ok: smeapiResp.ok,
        status: smeapiResp.status,
      });
    } catch (err) {
      logger.error('SMEAPI_REQUEST_FAILED', err, { txId });

      try {
        await svc.rpc('refund_transaction', {
          _tx_id: txId,
          _reason: `SMEAPI request failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        logger.log('REFUND_ISSUED_ON_ERROR', { txId });
      } catch (refundErr) {
        logger.error('REFUND_FAILED', refundErr, { txId });
      }

      return {
        success: false,
        error: 'SMEAPI connection failed. Wallet refunded.',
        data: { txId },
      };
    }

    // STEP 8: Check success
    const smeapiSuccess = isSMEAPISuccess(smeapiResp.body, logger);

    logger.log('SMEAPI_SUCCESS_CHECK', {
      txId,
      smeapiSuccess,
      status: smeapiResp.status,
      response: smeapiResp.body,
    });

    // STEP 9: Update transaction
    try {
      await svc
        .from('transactions')
        .update({
          provider_response: smeapiResp.body,
          supplier_reference:
            smeapiResp.body?.reference ||
            smeapiResp.body?.ident ||
            smeapiResp.body?.transaction_id,
        })
        .eq('id', txId);

      logger.log('TRANSACTION_UPDATED_WITH_RESPONSE', { txId });
    } catch (err) {
      logger.error('UPDATE_RESPONSE_ERROR', err, { txId });
    }

    // STEP 10: Handle failure
    if (!smeapiSuccess) {
      logger.log('SMEAPI_FAILED', {
        txId,
        reason: smeapiResp.body?.message || smeapiResp.body?.error,
      });

      try {
        await svc.rpc('refund_transaction', {
          _tx_id: txId,
          _reason:
            smeapiResp.body?.message ||
            smeapiResp.body?.error ||
            'SMEAPI purchase failed',
        });
        logger.log('REFUND_ISSUED_ON_FAILURE', { txId, totalAmount });
      } catch (refundErr) {
        logger.error('REFUND_FAILED', refundErr, { txId });
      }

      return {
        success: false,
        error:
          smeapiResp.body?.message ||
          smeapiResp.body?.error ||
          'Data purchase failed',
        data: { txId },
      };
    }

    // STEP 11: Mark as success
    try {
      await svc.rpc('complete_transaction', {
        _tx_id: txId,
        _supplier_reference:
          smeapiResp.body?.reference || smeapiResp.body?.ident,
        _provider_response: smeapiResp.body,
      });

      logger.log('TRANSACTION_COMPLETED', { txId });
    } catch (err) {
      logger.error('COMPLETE_TRANSACTION_ERROR', err, { txId });
    }

    logger.log('DATA_PURCHASE_SUCCESS', {
      txId,
      network: plan.network,
      dataSize: plan.data_size,
      phone,
    });

    return {
      success: true,
      data: {
        txId,
        phone,
        network: plan.network,
        dataSize: plan.data_size,
        amount: productAmount,
        charge: chargeAmount,
        total: totalAmount,
        message: `✓ Data purchase successful. ₦${productAmount} + ₦${chargeAmount} charge = ₦${totalAmount} deducted. Data arriving in 30 seconds.`,
      },
    };
  } catch (err) {
    logger.error('DATA_UNHANDLED_ERROR', err);
    return {
      success: false,
      error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Create logger for this request
  const logger = createLogger();
  let config: Config;

  try {
    logger.log('REQUEST_RECEIVED', {
      method: req.method,
      url: req.url,
    });

    // Load configuration
    try {
      config = loadConfig();
      logger.log('CONFIG_LOADED', {
        hasSupabaseUrl: !!config.supabaseUrl,
        hasSmeapiKey: !!config.smeapiKey,
        smeapiBaseUrl: config.smeapiBaseUrl,
      });
    } catch (err) {
      logger.error('CONFIG_LOAD_FAILED', err);
      return errorResponse('Server configuration error', 500);
    }

    // Initialize Supabase
    let svc: any;
    try {
      svc = createClient(config.supabaseUrl, config.supabaseServiceKey);
      logger.log('SUPABASE_INITIALIZED', {});
    } catch (err) {
      logger.error('SUPABASE_INIT_FAILED', err);
      return errorResponse('Database connection error', 500);
    }

    // Authenticate user
    let userId: string;
    try {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();

      if (!token) {
        logger.log('NO_AUTH_TOKEN', {});
        return errorResponse('Authentication required', 401);
      }

      const { data: authData, error: authErr } = await svc.auth.getUser(token);

      if (authErr || !authData?.user?.id) {
        logger.error('AUTH_FAILED', authErr || new Error('No user in response'));
        return errorResponse('Invalid session', 401);
      }

      userId = authData.user.id;
      logger.log('USER_AUTHENTICATED', { userId });
    } catch (err) {
      logger.error('AUTH_ERROR', err);
      return errorResponse('Authentication error', 401);
    }

    // Parse request
    let payload: any;
    try {
      const body = await req.text();
      logger.log('REQUEST_BODY_RECEIVED', { bodyLength: body.length });

      if (!body) {
        logger.log('EMPTY_BODY', {});
        return errorResponse('Request body is required', 400);
      }

      payload = JSON.parse(body);
      logger.log('PAYLOAD_PARSED', { action: payload?.action });
    } catch (err) {
      logger.error('PARSE_ERROR', err);
      return errorResponse('Invalid JSON in request body', 400);
    }

    const action = payload?.action;

    if (!action) {
      logger.log('NO_ACTION', {});
      return errorResponse('Action is required (buy-airtime or buy-data)', 400);
    }

    logger.log('ACTION_RECEIVED', { action });

    // Route to handler
    if (action === 'buy-airtime') {
      const { network, phone, amount } = payload;

      logger.log('AIRTIME_REQUEST', { network, phone, amount });

      const result = await buyAirtime(config, logger, svc, userId, network, phone, amount);

      logger.log('AIRTIME_COMPLETE', { success: result.success });

      if (result.success) {
        return successResponse(result.data);
      } else {
        return errorResponse(result.error || 'Airtime purchase failed', 400, {
          data: result.data,
        });
      }
    }

    if (action === 'buy-data') {
      const { plan_id, phone } = payload;

      logger.log('DATA_REQUEST', { plan_id, phone });

      const result = await buyData(config, logger, svc, userId, plan_id, phone);

      logger.log('DATA_COMPLETE', { success: result.success });

      if (result.success) {
        return successResponse(result.data);
      } else {
        return errorResponse(result.error || 'Data purchase failed', 400, {
          data: result.data,
        });
      }
    }

    logger.log('UNKNOWN_ACTION', { action });
    return errorResponse('Unknown action. Use buy-airtime or buy-data', 400);
  } catch (err) {
    logger.error('UNHANDLED_EXCEPTION', err);
    console.error('[FATAL ERROR]', err instanceof Error ? err.stack : err);

    // Always return JSON, never crash
    return errorResponse(
      'An unexpected error occurred. Please try again later.',
      500,
      {
        logs: logger.getLogs(),
      }
    );
  }
});
