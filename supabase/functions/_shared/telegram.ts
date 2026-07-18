// Shared Telegram helper: reads bot token / chat IDs and sends messages.
// Storage preference: secure_secrets rows > env vars.
//   telegram_bot_token, telegram_chat_id, telegram_extra_chat_ids (comma), telegram_enabled ('true'|'false')
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

export interface TelegramConfig {
  botToken: string | null
  chatIds: string[]
  enabled: boolean
}

// Never cache — always read fresh from the DB so admins see immediate effect.
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
        if (r.name === 'telegram_bot_token') botToken = (r.value || '').trim()
        else if (r.name === 'telegram_chat_id') primaryChat = (r.value || '').trim()
        else if (r.name === 'telegram_extra_chat_ids') extra = r.value || ''
        else if (r.name === 'telegram_enabled') enabled = r.value !== 'false'
      }
    } catch { /* fall back to env */ }
  }
  botToken = botToken || (Deno.env.get('TELEGRAM_BOT_TOKEN') || '').trim() || null
  primaryChat = primaryChat || (Deno.env.get('TELEGRAM_CHAT_ID') || '').trim() || null
  // Store as strings; trim aggressively to avoid whitespace/precision issues.
  const chatIds = [primaryChat, ...extra.split(',')]
    .map((s) => (s || '').toString().trim())
    .filter((s) => s.length > 0)
  return { botToken, chatIds, enabled }
}

async function tgFetch(botToken: string, method: string, body: unknown) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`
  const started = Date.now()
  console.log(`[telegram] → ${method}`, JSON.stringify(body))
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.error(`[telegram] ✗ ${method} network error`, e)
    return { ok: false, status: 0, json: { description: String((e as Error).message || e) } }
  }
  const json = await res.json().catch(() => ({}))
  console.log(`[telegram] ← ${method} status=${res.status} ok=${json?.ok} ${Date.now() - started}ms`, JSON.stringify(json).slice(0, 500))
  return { ok: res.ok && json?.ok === true, status: res.status, json }
}

export interface InlineButton { text: string; callback_data?: string; url?: string }
export type InlineKeyboard = InlineButton[][]

// Send a Telegram HTML message with automatic retry. Never throws.
export async function sendTelegramMessage(
  text: string,
  overrideChatId?: string,
  inline_keyboard?: InlineKeyboard,
): Promise<{ ok: boolean; error?: string; sent: number; details?: any; results?: Array<{ chat_id: string; message_id: number }> }> {
  try {
    const cfg = await getTelegramConfig()
    if (!cfg.enabled) return { ok: false, error: 'Telegram disabled', sent: 0 }
    if (!cfg.botToken) return { ok: false, error: 'Missing bot token', sent: 0 }
    const targets = overrideChatId ? [overrideChatId.trim()] : cfg.chatIds
    if (!targets.length) return { ok: false, error: 'Missing chat id', sent: 0 }
    let sent = 0
    let lastError = ''
    let lastDetails: any = null
    const results: Array<{ chat_id: string; message_id: number }> = []
    for (const chatId of targets) {
      let attempt = 0
      while (attempt < 3) {
        const body: any = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }
        if (inline_keyboard) body.reply_markup = { inline_keyboard }
        const r = await tgFetch(cfg.botToken, 'sendMessage', body)
        if (r.ok) {
          sent++
          const mid = r.json?.result?.message_id
          if (mid) results.push({ chat_id: chatId, message_id: mid })
          break
        }
        lastError = r.json?.description || `HTTP ${r.status}`
        lastDetails = r.json
        if (r.status >= 400 && r.status < 500) break
        attempt++
        if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt))
      }
    }
    return { ok: sent > 0, error: sent === 0 ? lastError : undefined, sent, details: lastDetails, results }
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e), sent: 0 }
  }
}

// Send a photo URL with HTML caption and optional inline keyboard.
export async function sendTelegramPhoto(
  photoUrl: string,
  caption: string,
  overrideChatId?: string,
  inline_keyboard?: InlineKeyboard,
): Promise<{ ok: boolean; error?: string; sent: number; results: Array<{ chat_id: string; message_id: number }> }> {
  const cfg = await getTelegramConfig()
  if (!cfg.enabled || !cfg.botToken) return { ok: false, error: 'Telegram disabled/no token', sent: 0, results: [] }
  const targets = overrideChatId ? [overrideChatId.trim()] : cfg.chatIds
  const results: Array<{ chat_id: string; message_id: number }> = []
  let sent = 0
  let lastError = ''
  for (const chatId of targets) {
    const body: any = { chat_id: chatId, photo: photoUrl, caption, parse_mode: 'HTML' }
    if (inline_keyboard) body.reply_markup = { inline_keyboard }
    const r = await tgFetch(cfg.botToken, 'sendPhoto', body)
    if (r.ok) {
      sent++
      const mid = r.json?.result?.message_id
      if (mid) results.push({ chat_id: chatId, message_id: mid })
    } else {
      lastError = r.json?.description || `HTTP ${r.status}`
    }
  }
  return { ok: sent > 0, error: sent === 0 ? lastError : undefined, sent, results }
}

export async function editTelegramCaption(chatId: string, messageId: number, caption: string, inline_keyboard?: InlineKeyboard) {
  const cfg = await getTelegramConfig()
  if (!cfg.botToken) return { ok: false }
  const body: any = { chat_id: chatId, message_id: messageId, caption, parse_mode: 'HTML' }
  body.reply_markup = { inline_keyboard: inline_keyboard || [] }
  return await tgFetch(cfg.botToken, 'editMessageCaption', body)
}

export async function editTelegramText(chatId: string, messageId: number, text: string, inline_keyboard?: InlineKeyboard) {
  const cfg = await getTelegramConfig()
  if (!cfg.botToken) return { ok: false }
  const body: any = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true }
  body.reply_markup = { inline_keyboard: inline_keyboard || [] }
  return await tgFetch(cfg.botToken, 'editMessageText', body)
}

export async function answerCallbackQuery(callback_query_id: string, text?: string, show_alert = false) {
  const cfg = await getTelegramConfig()
  if (!cfg.botToken) return { ok: false }
  return await tgFetch(cfg.botToken, 'answerCallbackQuery', { callback_query_id, text, show_alert })
}

export function getTelegramAdminIds(): string[] {
  const raw = (Deno.env.get('TELEGRAM_ADMIN_IDS') || '').trim()
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
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

function friendlyChatError(desc: string, chatId: string): string {
  const d = (desc || '').toLowerCase()
  if (d.includes('chat not found')) {
    return `Telegram says: "chat not found" for chat_id ${chatId}. This usually means the user/group has never messaged the bot. Open your Telegram bot and press Start (or add the bot to the group and send any message), then test again.`
  }
  if (d.includes('bot was blocked')) return `The user has blocked the bot. Unblock it in Telegram and try again.`
  if (d.includes("bot can't initiate")) return `The bot cannot initiate a conversation. Please open the bot in Telegram and press Start first.`
  if (d.includes('not enough rights')) return `Bot lacks permission to send messages in this chat. Grant it Send Messages permission.`
  return desc
}

export async function testTelegramConnection(botToken?: string, chatId?: string) {
  const cfg = botToken && chatId
    ? { botToken: botToken.trim(), chatIds: [chatId.trim()], enabled: true }
    : await getTelegramConfig()
  if (!cfg.botToken) return { status: 'invalid_bot_token', ok: false, error: 'Bot token missing' }
  if (!cfg.chatIds.length || !cfg.chatIds[0]) return { status: 'invalid_chat_id', ok: false, error: 'Chat ID missing or empty' }
  // 1. Validate bot token via getMe
  const me = await tgFetch(cfg.botToken, 'getMe', {})
  if (!me.ok) {
    if (me.status === 401) return { status: 'invalid_bot_token', ok: false, error: me.json?.description || 'Unauthorized — bot token is invalid', raw: me.json }
    return { status: 'telegram_api_error', ok: false, error: me.json?.description || `HTTP ${me.status}`, raw: me.json }
  }
  // 2. Validate chat id via getChat — surface the raw Telegram response.
  const target = cfg.chatIds[0]
  const chatRes = await tgFetch(cfg.botToken, 'getChat', { chat_id: target })
  if (!chatRes.ok) {
    const desc = chatRes.json?.description || `HTTP ${chatRes.status}`
    const friendly = friendlyChatError(desc, target)
    const status = /chat not found|invalid|bot can't initiate|bot was blocked/i.test(desc) ? 'invalid_chat_id' : 'telegram_api_error'
    return { status, ok: false, error: friendly, telegramError: desc, chatId: target, bot: me.json?.result, raw: chatRes.json }
  }
  return { status: 'connected', ok: true, bot: me.json?.result, chat: chatRes.json?.result, chatId: target }
}

// Verify whether a chat ID has actually interacted with the bot via getUpdates.
export async function verifyChatIdViaUpdates(botToken?: string, chatId?: string) {
  const cfg = botToken && chatId
    ? { botToken: botToken.trim(), chatIds: [chatId.trim()], enabled: true }
    : await getTelegramConfig()
  if (!cfg.botToken) return { ok: false, status: 'invalid_bot_token', error: 'Bot token missing' }
  const target = (chatId || cfg.chatIds[0] || '').toString().trim()
  if (!target) return { ok: false, status: 'invalid_chat_id', error: 'Chat ID missing' }

  const r = await tgFetch(cfg.botToken, 'getUpdates', { limit: 100, timeout: 0, allowed_updates: [] })
  if (!r.ok) {
    return { ok: false, status: 'telegram_api_error', error: r.json?.description || `HTTP ${r.status}`, raw: r.json }
  }
  const updates: any[] = r.json?.result || []
  const seenChats = new Set<string>()
  for (const u of updates) {
    const chat = u.message?.chat || u.edited_message?.chat || u.channel_post?.chat || u.my_chat_member?.chat
    if (chat?.id !== undefined) seenChats.add(String(chat.id))
  }
  if (seenChats.has(target)) {
    return { ok: true, status: 'verified', chatId: target, seen: Array.from(seenChats) }
  }
  return {
    ok: false,
    status: 'not_started',
    error: `This Chat ID has never started the bot. Open your Telegram bot and press Start, then click Verify again. (Note: getUpdates only shows recent updates; if a webhook is set, Telegram doesn't return updates here.)`,
    chatId: target,
    seen: Array.from(seenChats),
  }
}
