/**
 * paystack-webhook
 * Handles Paystack events, primarily charge.success for Dedicated Virtual Accounts.
 * When a user transfers money into their unique DVA, Paystack fires charge.success;
 * we credit the matching user's wallet (idempotent via funding_requests.reference).
 */
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { getActivePaystackSecret } from '../_shared/paystack.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function hmacSha512(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getWebhookSecret(svc: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data } = await svc.from('secure_secrets').select('value').eq('name', 'paystack_webhook_secret').maybeSingle()
    if (data?.value) return data.value
  } catch { /* ignore */ }
  return Deno.env.get('PAYSTACK_WEBHOOK_SECRET') || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const svc = createClient(url, svcKey)

  const rawBody = await req.text()
  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const webhookSecret = await getWebhookSecret(svc)
  if (webhookSecret) {
    const signature = req.headers.get('x-paystack-signature') || ''
    const expected = await hmacSha512(webhookSecret, rawBody)
    if (signature !== expected) {
      const { secret } = await getActivePaystackSecret()
      if (secret) {
        const alt = await hmacSha512(secret, rawBody)
        if (signature !== alt) return json({ error: 'Invalid signature' }, 401)
      } else {
        return json({ error: 'Invalid signature' }, 401)
      }
    }
  }

  const eventType: string = event?.event || ''
  const data = event?.data || {}

  if (eventType !== 'charge.success') {
    return json({ received: true, handled: false, event: eventType })
  }

  const status = String(data.status || '').toLowerCase()
  if (status && status !== 'success') {
    return json({ received: true, handled: false, reason: 'not success' })
  }

  const amountKobo = Number(data.amount || 0)
  const amountNaira = Math.round(amountKobo) / 100
  if (!amountNaira || amountNaira <= 0) {
    return json({ received: true, handled: false, reason: 'zero amount' })
  }

  const reference: string =
    data.reference ||
    data.authorization?.authorization_code ||
    `PS-${data.id || Date.now()}`

  let userId: string | null = data.metadata?.user_id || null
  const customerCode: string | null =
    data.customer?.customer_code || data.metadata?.customer_code || null
  const accountNumber: string | null =
    data.authorization?.receiver_bank_account_number ||
    data.authorization?.account_number ||
    data.dedicated_account?.account_number ||
    data.metadata?.account_number ||
    null
  const email: string | null = data.customer?.email || data.metadata?.email || null

  if (!userId && customerCode) {
    const { data: p } = await svc
      .from('profiles')
      .select('id')
      .eq('customer_code', customerCode)
      .maybeSingle()
    userId = p?.id ?? null
  }
  if (!userId && accountNumber) {
    const { data: p } = await svc
      .from('profiles')
      .select('id')
      .or(
        `dedicated_account_number.eq.\( {accountNumber},account_number.eq. \){accountNumber}`,
      )
      .maybeSingle()
    userId = p?.id ?? null
  }
  if (!userId && email) {
    const { data: p } = await svc.from('profiles').select('id').eq('email', email).maybeSingle()
    userId = p?.id ?? null
  }

  if (!userId) {
    console.error('paystack-webhook: user not found', { reference, customerCode, accountNumber, email })
    return json({ received: true, handled: false, reason: 'user not found', reference })
  }

  const { data: inserted, error: insertErr } = await svc
    .from('funding_requests')
    .insert({
      user_id: userId,
      amount: amountNaira,
      reference,
      provider: 'paystack_dva',
      status: 'approved',
      bank: data.authorization?.receiver_bank || data.authorization?.bank || 'Paystack DVA',
      reviewed_at: new Date().toISOString(),
      admin_remark: 'Auto-approved via Paystack dedicated virtual account webhook',
    })
    .select('id')
    .maybeSingle()

  if (insertErr) {
    return json({ received: true, handled: true, duplicate: true, reference, credited: false })
  }

  if (inserted) {
    const { error: creditErr } = await svc.rpc('credit_wallet', {
      _user_id: userId,
      _amount: amountNaira,
      _reference: reference,
      _description: `Bank transfer (dedicated account) · ${reference}`,
    })

    if (creditErr) {
      console.error('credit_wallet failed', creditErr)
      await svc
        .from('funding_requests')
        .update({
          status: 'pending',
          admin_remark: `Webhook received but credit_wallet failed: ${creditErr.message}`,
        })
        .eq('id', inserted.id)
      return json({ received: true, handled: false, error: creditErr.message, reference }, 500)
    }

    await svc.from('notifications').insert({
      user_id: userId,
      title: '✅ Wallet funded',
      body: `₦${amountNaira.toLocaleString()} received via your dedicated account and credited to your wallet.`,
    })

    try {
      const lines = [
        '💰 <b>DATA4ME • DVA Funding</b>',
        `<b>Amount:</b> ₦${amountNaira}`,
        `<b>Reference:</b> ${reference}`,
        `<b>User ID:</b> ${userId}`,
        accountNumber ? `<b>Account:</b> ${accountNumber}` : '',
        `<b>Time:</b> ${new Date().toISOString()}`,
      ]
        .filter(Boolean)
        .join('\n')
      fetch(`${url}/functions/v1/telegram-notify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${svcKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: lines }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  return json({ received: true, handled: true, reference, amount: amountNaira, user_id: userId, credited: !!inserted })
})
