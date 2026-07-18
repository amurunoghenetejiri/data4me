// Telegram webhook: receives callback_query events from inline buttons on
// funding-request messages, verifies the caller is an authorized Telegram admin,
// executes the corresponding funding action, then edits every prior notification
// to reflect the new status and disable the buttons for everyone.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import {
  answerCallbackQuery,
  editTelegramCaption,
  editTelegramText,
  formatTelegramMessage,
  getTelegramAdminIds,
} from '../_shared/telegram.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const svc = createClient(supaUrl, svcKey)

  const update = await req.json().catch(() => null)
  if (!update) return new Response('bad json', { status: 400 })

  try {
    const cq = update.callback_query
    if (!cq) return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { 'Content-Type': 'application/json' } })

    const from = cq.from || {}
    const tgUserId = String(from.id || '')
    const tgUserName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Telegram Admin'
    const admins = getTelegramAdminIds()

    const data = String(cq.data || '')
    // Format: fund:<action>:<funding_id>
    const [ns, act, fundingId] = data.split(':')
    if (ns !== 'fund' || !fundingId || !['approve', 'reject', 'cancel'].includes(act)) {
      await answerCallbackQuery(cq.id, 'Unsupported action', true)
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
    }

    if (admins.length && !admins.includes(tgUserId)) {
      await answerCallbackQuery(cq.id, '⛔ You are not authorized to use these controls.', true)
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Perform action atomically — RPC handles idempotency (returns already_processed:true if not pending).
    const { data: res, error } = await svc.rpc('tg_process_funding', {
      _id: fundingId,
      _action: act,
      _telegram_admin: tgUserId,
      _telegram_admin_name: tgUserName,
      _remark: null,
    })
    if (error) {
      await answerCallbackQuery(cq.id, `Error: ${error.message}`, true)
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const alreadyProcessed = !!res?.already_processed
    const status = res?.status || act
    const adminLabel = res?.admin_label || `${tgUserName} (${tgUserId})`

    await answerCallbackQuery(
      cq.id,
      alreadyProcessed
        ? `This request was already ${status}. Buttons refreshed.`
        : `Marked as ${status}.`,
      false,
    )

    // Fetch fresh info + all message refs, then edit every one to reflect the outcome.
    const { data: info } = await svc.rpc('tg_get_funding_info', { _id: fundingId })
    const { data: refs } = await svc.from('telegram_message_refs').select('*').eq('funding_id', fundingId)

    if (info && refs) {
      const statusEmoji = status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '🚫'
      const caption = formatTelegramMessage(`Funding ${status.toUpperCase()}`, statusEmoji, {
        'Full Name': info.full_name,
        Username: info.username ? '@' + info.username : null,
        Email: info.email,
        'User ID': info.user_id,
        Amount: '₦' + Number(info.amount).toLocaleString(),
        'Transaction ID': info.reference,
        'Payment Method': info.bank || info.provider,
        Status: String(status).toUpperCase(),
        'Wallet Balance': '₦' + Number(info.wallet_balance).toLocaleString(),
        'Action By': adminLabel,
        'Action At': new Date().toISOString(),
      })
      // Keep informational buttons but drop action buttons.
      const publicSite = Deno.env.get('PUBLIC_SITE_URL') || 'https://data4me.name.ng'
      const kb = [[
        { text: '👤 View User', url: `${publicSite}/admin/users?u=${info.user_id}` },
        { text: '📜 View Transaction', url: `${publicSite}/admin/deposits?ref=${encodeURIComponent(info.reference || '')}` },
      ]]
      for (const r of refs) {
        try {
          if (r.kind === 'photo') await editTelegramCaption(r.chat_id, r.message_id, caption, kb)
          else await editTelegramText(r.chat_id, r.message_id, caption, kb)
        } catch { /* ignore per-message failures */ }
      }
    }

    return new Response(JSON.stringify({ ok: true, status, alreadyProcessed }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
