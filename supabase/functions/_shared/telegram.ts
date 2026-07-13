// Shared Telegram helper: reads bot token / chat IDs and sends messages.
// Storage preference: secure_secrets rows > env vars.
//   telegram_bot_token, telegram_chat_id, telegram_extra_chat_ids (comma), telegram_enabled ('true'|'false')
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

export interface TelegramConfig {
  botToken: string | null
  chatIds: string[]
  enabled: boolean
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const url = Deno.env.get('SUPABASE_URL')
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  let botToken: string | null = null
  let primaryChat: string | null = null
  let extra: string = ''
  let enabled = true
  if (url && svcKey) {
    try {
      const svc = createClient(url, svcKey)
      const { data } = await svc
        .from('secure_secrets')
        .select('name,value')
        .in('name', ['telegram_bot_token', 'telegram_chat_id', 'telegram_extra_chat_ids', 'telegram_enabled'])
      for (const r of data || []) {
        if (r.name === 'telegram_bot_token') botToken = r.value
        else if (r.name === 'telegram_chat_id') primaryChat = r.value
        else if (r.name === 'telegram_extra_chat_ids') extra = r.value || ''
        else if (r.name === 'telegram_enabled') enabled = r.value !== 'false'
      }
    } catch { /* fall back to env */ }
  }
  botToken = botToken || Deno.env.get('TELEGRAM_BOT_TOKEN') || null
  primaryChat = primaryChat || Deno.env.get('TELEGRAM_CHAT_ID') || null
  const chatIds = [primaryChat, ...extra.split(',')]
    .map((s) => (s || '').trim())
    .filter(Boolean) as string[]
  return { botToken, chatIds, enabled }
}

async function tgFetch(botToken: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok && json?.ok === true, status: res.status, json }
}

// Send a Telegram HTML message with automatic retry. Never throws.
export async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string; sent: number }> {
  try {
    const cfg = await getTelegramConfig()
    if (!cfg.enabled) return { ok: false, error: 'Telegram disabled', sent: 0 }
    if (!cfg.botToken) return { ok: false, error: 'Missing bot token', sent: 0 }
    if (!cfg.chatIds.length) return { ok: false, error: 'Missing chat id', sent: 0 }
    let sent = 0
    let lastError = ''
    for (const chatId of cfg.chatIds) {
      let attempt = 0
      while (attempt < 3) {
        const r = await tgFetch(cfg.botToken, 'sendMessage', {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        })
        if (r.ok) { sent++; break }
        lastError = r.json?.description || `HTTP ${r.status}`
        attempt++
        if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt))
      }
    }
    return { ok: sent > 0, error: sent === 0 ? lastError : undefined, sent }
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e), sent: 0 }
  }
}

// Fire-and-forget: never blocks caller, never throws.
export function notifyTelegram(text: string): void {
  sendTelegramMessage(text).catch(() => {})
}

// Format a labelled data block into HTML.
export function formatTelegramMessage(title: string, emoji: string, rows: Record<string, string | number | null | undefined>) {
  const lines = [`${emoji} <b>DATA4ME • ${escapeHtml(title)}</b>`]
  for (const [k, v] of Object.entries(rows)) {
    if (v === null || v === undefined || v === '') continue
    lines.push(`<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`)
  }
  const now = new Date()
  lines.push(`<b>Date:</b> ${now.toISOString().slice(0, 10)}`)
  lines.push(`<b>Time:</b> ${now.toISOString().slice(11, 19)} UTC`)
  return lines.join('\n')
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function testTelegramConnection(botToken?: string, chatId?: string) {
  const cfg = botToken && chatId
    ? { botToken, chatIds: [chatId], enabled: true }
    : await getTelegramConfig()
  if (!cfg.botToken) return { status: 'invalid_bot_token', ok: false, error: 'Bot token missing' }
  if (!cfg.chatIds.length) return { status: 'invalid_chat_id', ok: false, error: 'Chat ID missing' }
  // 1. Validate bot token via getMe
  let me
  try {
    me = await tgFetch(cfg.botToken, 'getMe', {})
  } catch (e) {
    return { status: 'network_error', ok: false, error: String((e as Error).message || e) }
  }
  if (!me.ok) {
    if (me.status === 401) return { status: 'invalid_bot_token', ok: false, error: me.json?.description || 'Unauthorized' }
    return { status: 'telegram_api_error', ok: false, error: me.json?.description || `HTTP ${me.status}` }
  }
  // 2. Validate chat id via getChat
  const chatRes = await tgFetch(cfg.botToken, 'getChat', { chat_id: cfg.chatIds[0] })
  if (!chatRes.ok) {
    const desc = chatRes.json?.description || ''
    if (/chat not found|invalid/i.test(desc)) return { status: 'invalid_chat_id', ok: false, error: desc, bot: me.json?.result }
    return { status: 'telegram_api_error', ok: false, error: desc || `HTTP ${chatRes.status}`, bot: me.json?.result }
  }
  return { status: 'connected', ok: true, bot: me.json?.result, chat: chatRes.json?.result }
}
