// Telegram integration endpoint.
// Actions:
//   GET                  -> return current config (masked) + admin only
//   POST { action:'test' }         -> validate bot + chat (admin only)
//   POST { action:'send_test' }    -> send a test message (admin only)
//   POST { action:'save', settings } -> save token/chat config to secure_secrets (admin only)
//   POST { action:'notify', title, emoji, rows, audience } -> send a formatted message (auth required)
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import {
  editTelegramCaption,
  editTelegramText,
  formatTelegramMessage,
  getTelegramConfig,
  sendTelegramMessage,
  sendTelegramPhoto,
  testTelegramConnection,
  verifyChatIdViaUpdates,
  type InlineKeyboard,
} from '../_shared/telegram.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function mask(v?: string | null) {
  if (!v) return ''
  if (v.length <= 8) return '••••'
  return v.slice(0, 4) + '••••' + v.slice(-4)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supaUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const svc = createClient(supaUrl, svcKey)

  const auth = req.headers.get('Authorization') || ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  let userId: string | null = null
  let isAdmin = false
  if (jwt) {
    try {
      const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
      const { data: userData } = await userClient.auth.getUser()
      if (userData?.user) {
        userId = userData.user.id
        const { data: roles } = await svc.from('user_roles').select('role').eq('user_id', userId)
        isAdmin = !!roles?.some((r: any) => r.role === 'admin')
      }
    } catch { /* ignored */ }
  }

  try {
    if (req.method === 'GET') {
      if (!isAdmin) return json({ error: 'Forbidden' }, 403)
      const cfg = await getTelegramConfig()
      return json({
        enabled: cfg.enabled,
        botTokenSet: !!cfg.botToken,
        botTokenMasked: mask(cfg.botToken || ''),
        chatId: cfg.chatIds[0] || '',
        extraChatIds: cfg.chatIds.slice(1).join(','),
      })
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    if (action === 'notify') {
      // Any authenticated user can trigger notify; message content is server-formatted.
      if (!userId) return json({ error: 'Unauthorized' }, 401)
      const title = String(body.title || 'Event')
      const emoji = String(body.emoji || '🔔')
      const rows = body.rows && typeof body.rows === 'object' ? body.rows : {}
      const message = formatTelegramMessage(title, emoji, rows)
      const r = await sendTelegramMessage(message)
      return json(r)
    }

    // Funding submitted — send rich card with receipt + inline buttons to all admin chats.
    if (action === 'funding_submitted') {
      if (!userId) return json({ error: 'Unauthorized' }, 401)
      const fundingId = String(body.funding_id || '')
      if (!fundingId) return json({ error: 'funding_id required' }, 400)
      const { data: info, error: infoErr } = await svc.rpc('tg_get_funding_info', { _id: fundingId })
      if (infoErr || !info) return json({ error: infoErr?.message || 'Not found' }, 400)
      // Verify caller owns the request
      if (info.user_id !== userId) return json({ error: 'Forbidden' }, 403)

      const publicSite = Deno.env.get('PUBLIC_SITE_URL') || 'https://data4me.name.ng'
      let receiptLink = info.receipt_url as string | null
      if (receiptLink && !/^https?:\/\//i.test(receiptLink)) {
        const { data: signed } = await svc.storage.from('receipts').createSignedUrl(receiptLink, 60 * 60 * 24 * 7)
        receiptLink = signed?.signedUrl || null
      }

      const caption = formatTelegramMessage('New Wallet Funding Request', '💰', {
        'Full Name': info.full_name,
        Username: info.username ? '@' + info.username : null,
        Email: info.email,
        Phone: info.phone,
        'User ID': info.user_id,
        Amount: '₦' + Number(info.amount).toLocaleString(),
        'Transaction ID': info.reference,
        'Payment Method': info.bank || info.provider,
        Status: (info.status || 'pending').toUpperCase(),
        'Wallet Balance': '₦' + Number(info.wallet_balance).toLocaleString(),
        Submitted: new Date(info.created_at).toISOString(),
      })
      const kb: InlineKeyboard = [
        [
          { text: '✅ Approve', callback_data: `fund:approve:${info.id}` },
          { text: '❌ Reject', callback_data: `fund:reject:${info.id}` },
        ],
        [
          { text: '🚫 Cancel', callback_data: `fund:cancel:${info.id}` },
        ],
        [
          { text: '👤 View User', url: `${publicSite}/admin/users?u=${info.user_id}` },
          { text: '📜 View Transaction', url: `${publicSite}/admin/deposits?ref=${encodeURIComponent(info.reference || '')}` },
        ],
      ]

      let result: { ok: boolean; sent: number; results: Array<{ chat_id: string; message_id: number }>; error?: string }
      if (receiptLink && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(receiptLink)) {
        result = await sendTelegramPhoto(receiptLink, caption, undefined, kb)
      } else {
        const withLink = receiptLink ? caption + `\n\n<a href="${receiptLink}">📎 Open Receipt</a>` : caption
        const r = await sendTelegramMessage(withLink, undefined, kb)
        result = { ok: r.ok, sent: r.sent, results: r.results || [], error: r.error }
      }
      // Persist message refs for later editing
      if (result.results?.length) {
        await svc.from('telegram_message_refs').insert(
          result.results.map((m) => ({ funding_id: info.id, chat_id: m.chat_id, message_id: m.message_id, kind: receiptLink && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(receiptLink) ? 'photo' : 'text' })),
        )
      }
      return json(result)
    }


    // Admin-only actions below
    if (!isAdmin) return json({ error: 'Forbidden' }, 403)

    // Edit prior Telegram funding messages after a web-dashboard action.
    if (action === 'funding_admin_action') {
      const fundingId = String(body.funding_id || '')
      const status = String(body.status || '')
      if (!fundingId || !['approved', 'rejected', 'cancelled'].includes(status)) {
        return json({ error: 'Invalid params' }, 400)
      }
      const { data: info } = await svc.rpc('tg_get_funding_info', { _id: fundingId })
      const { data: refs } = await svc.from('telegram_message_refs').select('*').eq('funding_id', fundingId)
      if (!info || !refs) return json({ ok: true, edited: 0 })
      const statusEmoji = status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '🚫'
      // Resolve acting admin name from profiles table
      let adminLabel = 'Web Admin'
      try {
        const { data: prof } = await svc.from('profiles').select('full_name, username, email').eq('id', userId).maybeSingle()
        if (prof) adminLabel = (prof.full_name || prof.username || prof.email || 'Admin') + ' (web)'
      } catch { /* ignore */ }
      const caption = formatTelegramMessage(`Funding ${status.toUpperCase()}`, statusEmoji, {
        'Full Name': info.full_name,
        Username: info.username ? '@' + info.username : null,
        Email: info.email,
        'User ID': info.user_id,
        Amount: '₦' + Number(info.amount).toLocaleString(),
        'Transaction ID': info.reference,
        'Payment Method': info.bank || info.provider,
        Status: status.toUpperCase(),
        'Wallet Balance': '₦' + Number(info.wallet_balance).toLocaleString(),
        'Action By': adminLabel,
        Remark: info.admin_remark,
        'Action At': new Date().toISOString(),
      })
      const publicSite = Deno.env.get('PUBLIC_SITE_URL') || 'https://data4me.lovable.app'
      const kb = [[
        { text: '👤 View User', url: `${publicSite}/admin/users?u=${info.user_id}` },
        { text: '📜 View Transaction', url: `${publicSite}/admin/deposits?ref=${encodeURIComponent(info.reference || '')}` },
      ]]
      let edited = 0
      for (const r of refs as any[]) {
        try {
          if (r.kind === 'photo') await editTelegramCaption(r.chat_id, r.message_id, caption, kb)
          else await editTelegramText(r.chat_id, r.message_id, caption, kb)
          edited++
        } catch { /* ignore */ }
      }
      return json({ ok: true, edited })
    }


    if (action === 'test') {
      const r = await testTelegramConnection(
        typeof body.botToken === 'string' ? body.botToken.trim() : undefined,
        typeof body.chatId === 'string' ? body.chatId.trim() : undefined,
      )
      return json(r)
    }

    if (action === 'verify_chat') {
      const r = await verifyChatIdViaUpdates(
        typeof body.botToken === 'string' ? body.botToken.trim() : undefined,
        typeof body.chatId === 'string' ? body.chatId.trim() : undefined,
      )
      return json(r)
    }

    if (action === 'send_test') {
      // Always read fresh from DB — never cache.
      const cfg = await getTelegramConfig()
      if (!cfg.botToken) return json({ ok: false, error: 'Bot token not configured' }, 400)
      if (!cfg.chatIds.length) return json({ ok: false, error: 'Chat ID not configured' }, 400)
      const message = formatTelegramMessage('Test Message', '✅', {
        'Event Type': 'Integration Test',
        Status: 'OK',
        'Chat ID': cfg.chatIds[0],
        'Sent By': 'Super Admin',
      })
      const r = await sendTelegramMessage(message)
      if (!r.ok && r.error) {
        // Surface real Telegram error to the admin UI.
        return json({ ok: false, sent: r.sent, error: r.error, details: r.details }, 400)
      }
      return json(r)
    }


    if (action === 'save') {
      const s = body.settings || {}
      const rows: { name: string; value: string; updated_by: string; updated_at: string }[] = []
      const now = new Date().toISOString()
      if (typeof s.botToken === 'string' && s.botToken.trim()) {
        rows.push({ name: 'telegram_bot_token', value: s.botToken.trim(), updated_by: userId!, updated_at: now })
      }
      if (typeof s.chatId === 'string') {
        rows.push({ name: 'telegram_chat_id', value: s.chatId.trim(), updated_by: userId!, updated_at: now })
      }
      if (typeof s.extraChatIds === 'string') {
        rows.push({ name: 'telegram_extra_chat_ids', value: s.extraChatIds.trim(), updated_by: userId!, updated_at: now })
      }
      if (typeof s.enabled === 'boolean') {
        rows.push({ name: 'telegram_enabled', value: s.enabled ? 'true' : 'false', updated_by: userId!, updated_at: now })
      }
      if (rows.length) {
        const { error } = await svc.from('secure_secrets').upsert(rows)
        if (error) return json({ error: error.message }, 500)
      }
      try {
        await svc.rpc('log_admin_action', {
          _action: 'update_telegram_config',
          _target_type: 'secure_secrets',
          _target_id: 'telegram',
          _details: { fields: rows.map((r) => r.name) },
        })
      } catch { /* ignore */ }
      return json({ ok: true })
    }

    if (action === 'set_webhook') {
      const cfg = await getTelegramConfig()
      if (!cfg.botToken) return json({ ok: false, error: 'Bot token not configured' }, 400)
      const webhookUrl = `${supaUrl}/functions/v1/telegram-webhook`
      const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ['callback_query'] }),
      })
      const j = await r.json().catch(() => ({}))
      return json({ ok: !!j?.ok, webhook_url: webhookUrl, result: j })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
