import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { getActivePaystackSecret } from '../_shared/paystack.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { amount, email, username } = await req.json()
    if (!amount || amount < 100 || !email) return json({ error: 'amount (>=100) and email are required' }, 400)

    const { secret } = await getActivePaystackSecret()
    if (!secret) return json({ error: 'Paystack not configured' }, 500)

    const reference = `D4M-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const origin = req.headers.get('origin') ?? ''

    // Resolve caller user_id from Auth header if present
    const authHeader = req.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const svc = createClient(url, svcKey)
    let userId: string | null = null
    const token = authHeader.replace('Bearer ', '').trim()
    if (token) {
      const { data: u } = await svc.auth.getUser(token)
      userId = u?.user?.id ?? null
    }
    if (!userId) {
      const { data: prof } = await svc.from('profiles').select('id').eq('email', email).maybeSingle()
      userId = prof?.id ?? null
    }

    // Apply per-service funding charge (user pays gross, wallet receives `amount`)
    const { data: chargeVal } = await svc.rpc('apply_charge', { _service: 'funding_paystack', _amount: Number(amount) })
    const charge = Number(chargeVal || 0)
    const gross = Number(amount) + charge

    // NOTE: we intentionally do NOT persist a funding_request or transaction here.
    // Nothing gets recorded until paystack-verify confirms a successful charge.
    // This prevents "pending"/abandoned/cancelled/PIN-only attempts from ever
    // appearing in the user's wallet history.

    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, amount: Math.round(gross * 100), reference,
        callback_url: `${origin}/wallet?paystack_ref=${reference}`,
        metadata: { username, user_id: userId, source: 'data4me-wallet', wallet_credit: Number(amount), charge },
      }),
    })
    const data = await r.json()
    if (!data?.status) return json({ error: data?.message || 'Init failed' }, 502)
    return json({ authorization_url: data.data.authorization_url, reference: data.data.reference, gross, charge })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
