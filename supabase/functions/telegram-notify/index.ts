// Telegram integration endpoint.
// Actions:
//   GET                  -> return current config (masked) + admin only
//   POST { action:'test' }         -> validate bot + chat (admin only)
//   POST { action:'send_test' }    -> send a test message (admin only)
//   POST { action:'save', settings } -> save token/chat config to secure_secrets (admin only)
//   POST { action:'notify', title, emoji, rows, audience } -> send a formatted message (auth required)
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import {
  formatTelegramMessage,
  getTelegramConfig,
  sendTelegramMessage,
  testTelegramConnection,
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

    // Admin-only actions below
    if (!isAdmin) return json({ error: 'Forbidden' }, 403)

    if (action === 'test') {
      const r = await testTelegramConnection(body.botToken, body.chatId)
      return json(r)
    }

    if (action === 'send_test') {
      const cfg = await getTelegramConfig()
      if (!cfg.botToken || !cfg.chatIds.length) return json({ ok: false, error: 'Configuration incomplete' }, 400)
      const message = formatTelegramMessage('Test Message', '✅', {
        'Event Type': 'Integration Test',
        Status: 'OK',
        'Sent By': 'Super Admin',
      })
      const r = await sendTelegramMessage(message)
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
      await svc.rpc('log_admin_action', {
        _action: 'update_telegram_config',
        _target_type: 'secure_secrets',
        _target_id: 'telegram',
        _details: { fields: rows.map((r) => r.name) },
      }).catch(() => {})
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
