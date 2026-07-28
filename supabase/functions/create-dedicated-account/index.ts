
/**
 * create-dedicated-account
 * Assigns a Paystack Dedicated Virtual Account (NUBAN) to the authenticated user.
 * Idempotent: if the user already has a dedicated_account_number, returns it.
 *
 * Flow:
 *  1. Auth user from JWT
 *  2. Load profile
 *  3. If already assigned → return existing details
 *  4. Create / lookup Paystack customer
 *  5. Create dedicated virtual account
 *  6. Persist on profiles + return
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { getActivePaystackSecret } from '../_shared/paystack.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizePhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) return `+234${digits.slice(1)}`
  if (digits.length === 13 && digits.startsWith('234')) return `+${digits}`
  if (digits.length === 10) return `+234${digits}`
  if (phone.startsWith('+')) return phone
  return phone
}

async function paystackFetch(path: string, secret: string, init?: RequestInit) {
  const r = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const body = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, body }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const svc = createClient(url, svcKey)

    const { data: authData, error: authErr } = await svc.auth.getUser(token)
    if (authErr || !authData?.user) return json({ error: 'Unauthorized' }, 401)
    const userId = authData.user.id
    const authEmail = authData.user.email || ''

    const { data: profile, error: profErr } = await svc
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (profErr) return json({ error: profErr.message }, 500)
    if (!profile) return json({ error: 'Profile not found' }, 404)

    // Already assigned — return existing
    if (profile.dedicated_account_assigned && profile.dedicated_account_number) {
      return json({
        success: true,
        already_assigned: true,
        account_number: profile.dedicated_account_number,
        bank_name: profile.dedicated_bank_name || profile.bank_name || null,
        account_name: profile.account_name || profile.full_name || null,
        customer_code: profile.customer_code || null,
        dedicated_account_id: profile.dedicated_account_id || null,
      })
    }

    const { secret } = await getActivePaystackSecret()
    if (!secret) return json({ error: 'Paystack secret key not configured' }, 500)

    const email = (profile.email || authEmail || '').trim()
    if (!email) return json({ error: 'User email is required to create a virtual account' }, 400)

    const fullName = (profile.full_name || profile.username || email.split('@')[0] || 'Customer').trim()
    const nameParts = fullName.split(/\s+/).filter(Boolean)
    const first_name = nameParts[0] || 'Customer'
    const last_name = nameParts.slice(1).join(' ') || 'User'
    const phone = normalizePhone(profile.phone)

    const preferredBank = Deno.env.get('PAYSTACK_DVA_BANK') || 'wema-bank'

    // 1) Create or fetch Paystack customer
    let customerCode: string | null = profile.customer_code || null

    if (!customerCode) {
      const createCust = await paystackFetch('/customer', secret, {
        method: 'POST',
        body: JSON.stringify({
          email,
          first_name,
          last_name,
          phone,
          metadata: { user_id: userId, username: profile.username },
        }),
      })

      if (createCust.ok && createCust.body?.data?.customer_code) {
        customerCode = createCust.body.data.customer_code
      } else {
        const fetchCust = await paystackFetch(`/customer/${encodeURIComponent(email)}`, secret)
        if (fetchCust.ok && fetchCust.body?.data?.customer_code) {
          customerCode = fetchCust.body.data.customer_code
        } else {
          const msg =
            createCust.body?.message ||
            fetchCust.body?.message ||
            'Failed to create Paystack customer'
          return json({ error: msg, detail: createCust.body }, 502)
        }
      }
    }

    // 2) Create dedicated virtual account
    const dvaRes = await paystackFetch('/dedicated_account', secret, {
      method: 'POST',
      body: JSON.stringify({
        customer: customerCode,
        preferred_bank: preferredBank,
        first_name,
        last_name,
        phone,
      }),
    })

    if (!dvaRes.ok || !dvaRes.body?.status) {
      const listRes = await paystackFetch(
        `/dedicated_account?customer=${encodeURIComponent(customerCode!)}`,
        secret,
      )
      const existing = listRes.body?.data?.[0]
      if (existing?.account_number) {
        const bankName = existing.bank?.name || existing.bank_name || preferredBank
        const accountName = existing.account_name || fullName
        const dedicatedId = String(existing.id ?? existing.dedicated_account_id ?? '')

        await svc
          .from('profiles')
          .update({
            customer_code: customerCode,
            dedicated_account_id: dedicatedId || null,
            dedicated_account_number: existing.account_number,
            dedicated_bank_name: bankName,
            dedicated_account_assigned: true,
            account_number: existing.account_number,
            account_name: accountName,
            bank_name: bankName,
          })
          .eq('id', userId)

        return json({
          success: true,
          already_assigned: true,
          account_number: existing.account_number,
          bank_name: bankName,
          account_name: accountName,
          customer_code: customerCode,
          dedicated_account_id: dedicatedId || null,
        })
      }

      const msg = dvaRes.body?.message || 'Failed to create dedicated virtual account'
      return json({ error: msg, detail: dvaRes.body }, 502)
    }

    const dva = dvaRes.body.data
    const accountNumber = dva.account_number
    const bankName = dva.bank?.name || dva.bank_name || preferredBank
    const accountName = dva.account_name || fullName
    const dedicatedId = String(dva.id ?? dva.dedicated_account_id ?? '')

    if (!accountNumber) {
      return json({ error: 'Paystack returned no account number', detail: dvaRes.body }, 502)
    }

    const { error: updErr } = await svc
      .from('profiles')
      .update({
        customer_code: customerCode,
        dedicated_account_id: dedicatedId || null,
        dedicated_account_number: accountNumber,
        dedicated_bank_name: bankName,
        dedicated_account_assigned: true,
        account_number: accountNumber,
        account_name: accountName,
        bank_name: bankName,
      })
      .eq('id', userId)

    if (updErr) return json({ error: updErr.message }, 500)

    try {
      const lines = [
        '🏦 <b>DATA4ME • Dedicated Account Assigned</b>',
        `<b>User:</b> ${profile.username || email}`,
        `<b>Account:</b> ${accountNumber}`,
        `<b>Bank:</b> ${bankName}`,
        `<b>Name:</b> ${accountName}`,
      ].join('\n')
      const tgUrl = `${url}/functions/v1/telegram-notify`
      fetch(tgUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${svcKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: lines }),
      }).catch(() => {})
    } catch { /* ignore */ }

    return json({
      success: true,
      already_assigned: false,
      account_number: accountNumber,
      bank_name: bankName,
      account_name: accountName,
      customer_code: customerCode,
      dedicated_account_id: dedicatedId || null,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
