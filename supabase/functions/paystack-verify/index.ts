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

    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await r.json()
    const success = data?.status && data?.data?.status === 'success'
    const amount = success ? Number(data.data.amount) / 100 : 0
    const email = data?.data?.customer?.email ?? null

    // Server-side idempotent wallet credit (never trust the browser)
    let credited = false
    if (success) {
      const url = Deno.env.get('SUPABASE_URL')!
      const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const svc = createClient(url, svcKey)

      // Locate funding request by reference (created at initialize time)
      const { data: fr } = await svc.from('funding_requests').select('*').eq('reference', reference).maybeSingle()
      let userId: string | null = fr?.user_id ?? null

      // Fallback: resolve by email
      if (!userId && email) {
        const { data: prof } = await svc.from('profiles').select('id').eq('email', email).maybeSingle()
        userId = prof?.id ?? null
      }

      if (userId) {
        if (fr) {
          if (fr.status !== 'approved') {
            await svc.from('funding_requests').update({ status: 'approved', reviewed_at: new Date().toISOString(), admin_remark: 'Auto-approved via Paystack' }).eq('id', fr.id)
            await svc.rpc('credit_wallet', { _user_id: userId, _amount: amount, _reference: reference, _description: `Paystack funding · ${reference}` })
            credited = true
          } else {
            credited = true // already processed
          }
        } else {
          // No pre-existing FR (e.g. edge case) — create + credit
          await svc.from('funding_requests').insert({
            user_id: userId, amount, reference, provider: 'paystack', status: 'approved',
            bank: 'Paystack', reviewed_at: new Date().toISOString(), admin_remark: 'Auto-approved via Paystack',
          })
          await svc.rpc('credit_wallet', { _user_id: userId, _amount: amount, _reference: reference, _description: `Paystack funding · ${reference}` })
          credited = true
        }
      }
    }

    if (credited) {
      const lines = [
        '💰 <b>DATA4ME • Wallet Funded (Paystack)</b>',
        `<b>Event Type:</b> Wallet Credit`,
        `<b>Amount:</b> ₦${amount}`,
        `<b>Reference:</b> ${reference}`,
        email ? `<b>Email:</b> ${email}` : '',
        `<b>Status:</b> success`,
        `<b>Time:</b> ${new Date().toISOString()}`,
      ].filter(Boolean).join('\n')
      notifyTelegram(lines)
    }

    return json({
      success, reference, amount, email, credited,
      raw_status: data?.data?.status ?? 'unknown',
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
