import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { getActivePaystackSecret } from '../_shared/paystack.ts'
import { notifyTelegram } from '../_shared/telegram.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { reference } = await req.json()
    if (!reference) return json({ error: 'reference required' }, 400)
    const { secret } = await getActivePaystackSecret()
    if (!secret) return json({ error: 'Paystack not configured' }, 500)

    // 1. Ask Paystack for the authoritative payment status. Never trust the browser.
    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await r.json()
    const rawStatus: string = data?.data?.status ?? 'unknown'
    const success = data?.status === true && rawStatus === 'success'
    const amount = success ? Number(data.data.amount) / 100 : 0
    const email = data?.data?.customer?.email ?? null
    const metaWalletCredit = Number(data?.data?.metadata?.wallet_credit ?? amount)
    const walletCredit = Number.isFinite(metaWalletCredit) && metaWalletCredit > 0 ? metaWalletCredit : amount

    // Payment did not succeed — do NOT create any funding_request or transaction.
    if (!success) {
      return json({ success: false, reference, credited: false, raw_status: rawStatus, message: data?.data?.gateway_response || 'Payment not completed' })
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const svc = createClient(url, svcKey)

    // Resolve the owning user (metadata is the fastest path).
    let userId: string | null = data?.data?.metadata?.user_id ?? null
    if (!userId && email) {
      const { data: prof } = await svc.from('profiles').select('id').eq('email', email).maybeSingle()
      userId = prof?.id ?? null
    }
    if (!userId) {
      return json({ success: true, credited: false, reference, amount: walletCredit, message: 'User not found for this reference' })
    }

    // 2. Atomic idempotency via the unique (reference) index on funding_requests.
    //    - First caller inserts the "approved" row and credits the wallet.
    //    - Duplicate callbacks (browser retries, webhook, refresh) hit the
    //      unique constraint, get null back, and skip crediting entirely.
    const { data: inserted, error: insertErr } = await svc
      .from('funding_requests')
      .insert({
        user_id: userId,
        amount: walletCredit,
        reference,
        provider: 'paystack',
        status: 'approved',
        bank: 'Paystack',
        reviewed_at: new Date().toISOString(),
        admin_remark: 'Auto-approved via Paystack (verified)',
      })
      .select('id')
      .maybeSingle()

    let credited = false
    if (insertErr) {
      // Duplicate reference — someone already processed this payment. That is a
      // success from the client's point of view, but we must not credit again.
      const { data: existing } = await svc.from('funding_requests').select('status').eq('reference', reference).maybeSingle()
      credited = existing?.status === 'approved'
      return json({ success: true, reference, amount: walletCredit, email, credited, raw_status: rawStatus, duplicate: true })
    }

    if (inserted) {
      // Only credit once — inside the same "first winner" branch.
      await svc.rpc('credit_wallet', {
        _user_id: userId,
        _amount: walletCredit,
        _reference: reference,
        _description: `Paystack funding · ${reference}`,
      })
      credited = true

      const lines = [
        '💰 <b>DATA4ME • Wallet Funded (Paystack)</b>',
        `<b>Event Type:</b> Wallet Credit`,
        `<b>Amount:</b> ₦${walletCredit}`,
        `<b>Reference:</b> ${reference}`,
        email ? `<b>Email:</b> ${email}` : '',
        `<b>Status:</b> success`,
        `<b>Time:</b> ${new Date().toISOString()}`,
      ].filter(Boolean).join('\n')
      notifyTelegram(lines)
    }

    return json({ success: true, reference, amount: walletCredit, email, credited, raw_status: rawStatus })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
