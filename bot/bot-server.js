import 'dotenv/config'
import express    from 'express'
import cors       from 'cors'
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import pino       from 'pino'
import NodeCache  from 'node-cache'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'fs'

// ── Express ───────────────────────────────────────────────────
const app  = express()
const PORT = process.env.PORT || 3000
app.use(cors())
app.use(express.json())

// ── Logger ────────────────────────────────────────────────────
const logger = pino({
  level: 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
})

// ── Supabase (service role — full DB access) ──────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  logger.error('Missing SUPABASE_URL or SUPABASE_KEY env vars')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
})

// ── Edge Function URL — all AI goes through here ──────────────
const AI_EDGE_URL = `${SUPABASE_URL}/functions/v1/ai-reply`

// ── In-memory state ───────────────────────────────────────────
// Map of merchantId → { sock, connected, config, connectedAt }
const merchants  = new Map()
const dailyCache = new NodeCache({ stdTTL: 86400 })  // resets each day
const msgDedup   = new NodeCache({ stdTTL: 3600  })  // dedup window 1h

// ═══════════════════════════════════════════════════════════════
// API ROUTES — called by the LinkaMarket HTML app
// ═══════════════════════════════════════════════════════════════

// Health check
app.get('/', (req, res) => {
  res.json({
    service:   'LinkaMarket WhatsApp Bot',
    status:    'running',
    merchants: merchants.size,
    uptime:    Math.floor(process.uptime()) + 's'
  })
})

// Merchant status check (polled every 15s by app)
app.get('/status', (req, res) => {
  const merchantId = req.query.merchant
  if (!merchantId) return res.status(400).json({ error: 'merchant required' })

  const m       = merchants.get(merchantId)
  const botAge  = m?.connectedAt
    ? Math.floor((Date.now() - new Date(m.connectedAt).getTime()) / 86400000)
    : 0
  const dayKey  = `daily:${merchantId}:${today()}`

  res.json({
    connected:    m?.connected || false,
    phone:        m?.config?.wa_number || '',
    today_count:  dailyCache.get(dayKey) || 0,
    daily_limit:  getDailyLimit(botAge),
    bot_age_days: botAge
  })
})

// Request pair code — merchant taps "Pata Code" in app
app.post('/pair', async (req, res) => {
  const { phone, merchant_id } = req.body

  if (!phone || !merchant_id) {
    return res.status(400).json({ error: 'phone and merchant_id required' })
  }

  // Clean up old session if merchant is re-pairing
  if (merchants.has(merchant_id)) {
    try { merchants.get(merchant_id).sock?.end() } catch {}
  }

  merchants.set(merchant_id, {
    connected:   false,
    connectedAt: null,
    config: { wa_number: phone, auto_reply: true, quiet_hours: true }
  })

  try {
    const code = await initBot(merchant_id, phone)

    // BUG 1 FIX: 'already_registered' means the session exists and the socket
    // is reconnecting in the background. Don't treat this as an error —
    // tell the frontend the bot is reconnecting so it keeps polling /status.
    if (code === 'already_registered') {
      logger.info(`[${merchant_id}] Session exists — reconnecting in background`)
      return res.json({ code: null, reconnecting: true, message: 'Bot inaungana tena — subiri sekunde 15 kisha angalia hali.' })
    }

    logger.info(`Pair code for ${merchant_id}: ${code}`)
    res.json({ code, message: 'Enter this code in WhatsApp → Linked Devices' })
  } catch (err) {
    logger.error('Pair error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Update bot settings (auto_reply, quiet_hours) from app toggles
app.post('/settings', async (req, res) => {
  const merchantId = req.headers['x-merchant-id']
  const { setting, value } = req.body
  if (!merchantId) return res.status(401).json({ error: 'x-merchant-id header required' })

  const m = merchants.get(merchantId)
  if (m?.config) {
    m.config[setting] = value
    logger.info(`[${merchantId}] Setting: ${setting} = ${value}`)
  }
  res.json({ ok: true })
})

// Disconnect merchant's bot
app.post('/disconnect', async (req, res) => {
  const { merchant_id } = req.body
  if (!merchant_id) return res.status(400).json({ error: 'merchant_id required' })

  try { merchants.get(merchant_id)?.sock?.end() } catch {}
  merchants.delete(merchant_id)

  await sb.from('profiles').update({
    bot_connection_status: 'disconnected'
  }).eq('id', merchant_id)

  res.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════
// WHATSAPP BOT CORE
// ═══════════════════════════════════════════════════════════════

async function initBot(merchantId, phone) {
  const sessPath = `./sessions/${merchantId}`
  mkdirSync(sessPath, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(sessPath)
  const { version }          = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger:                       pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    printQRInTerminal:            false,  // pair code only
    generateHighQualityLinkPreview: false,
    syncFullHistory:              false,
    markOnlineOnConnect:          false,  // don't show as "online" 24/7
    getMessage: async () => undefined,
  })

  // ── BUG 4 FIX: Always ensure the merchants entry exists before using it ──
  // This handles the case where merchants.delete() was called on logout
  // and then initBot is called again on reconnect — the entry is gone.
  if (!merchants.has(merchantId)) {
    merchants.set(merchantId, {
      connected:   false,
      connectedAt: null,
      config: { wa_number: phone, auto_reply: true, quiet_hours: true }
    })
  }
  merchants.get(merchantId).sock = sock

  // ── Connection events ──────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update
    const m = merchants.get(merchantId)
    if (!m) return

    if (connection === 'open') {
      m.connected   = true
      m.connectedAt = m.connectedAt || new Date().toISOString()
      logger.info(`✅ [${merchantId}] Connected as ${phone}`)

      await sb.from('profiles').update({
        bot_connection_status: 'connected',
        bot_connected_at:      m.connectedAt,
        bot_last_seen:         new Date().toISOString()
      }).eq('id', merchantId)
    }

    if (connection === 'close') {
      m.connected = false
      const code  = lastDisconnect?.error?.output?.statusCode
      logger.warn(`🔴 [${merchantId}] Disconnected (code ${code})`)

      await sb.from('profiles').update({
        bot_connection_status: 'disconnected',
        bot_last_seen:         new Date().toISOString()
      }).eq('id', merchantId)

      // ── SHIELD 6: Reconnect cooldown — random delay, not instant ──
      if (code !== DisconnectReason.loggedOut) {
        const delay = randomBetween(8000, 25000)
        logger.info(`⏳ Reconnecting [${merchantId}] in ${Math.round(delay/1000)}s`)
        // BUG 3 FIX: wrap in async IIFE so errors are caught, not silently dropped
        setTimeout(async () => {
          try { await initBot(merchantId, phone) } catch(e) {
            logger.error(`Reconnect failed for [${merchantId}]: ${e.message}`)
          }
        }, delay)
      } else {
        logger.warn(`[${merchantId}] Logged out — requires manual re-pair`)
        merchants.delete(merchantId)
      }
    }
  })

  sock.ev.on('creds.update', saveCreds)

  // ── Incoming messages ──────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      await handleMessage(sock, merchantId, msg)
    }
  })

  // ── BUG 1 FIX: Request pair code if not registered.
  // If already registered, do NOT return early — the socket is already
  // reconnecting in the background via connection.update events above.
  // We return 'already_registered' as a signal to the /pair route only.
  if (!state.creds.registered) {
    await sleep(1500)
    const code = await sock.requestPairingCode(phone)
    return code
  }

  return 'already_registered'
}

// ── Message handler — runs all 8 shields ──────────────────────
async function handleMessage(sock, merchantId, msg) {
  const m = merchants.get(merchantId)
  if (!m?.config) return

  // ── SHIELD 1: Inbound-only enforcement ────────────────────
  if (msg.key.fromMe) return
  const jid = msg.key.remoteJid || ''
  if (jid.includes('@g.us'))        return  // no group chats
  if (jid.includes('@broadcast'))   return  // no broadcasts
  if (jid === 'status@broadcast')   return  // no status updates

  const text = extractText(msg)
  if (!text || text.trim().length < 2) return

  // ── SHIELD 1b: Message deduplication ─────────────────────
  // Baileys can fire the same message twice on reconnect
  if (msgDedup.get(msg.key.id)) return
  msgDedup.set(msg.key.id, true)

  // Check auto-reply is enabled
  if (m.config.auto_reply === false) return

  const customerPhone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '')
  const customerName  = msg.pushName || null
  logger.info(`📨 [${merchantId}] "${text.slice(0,50)}" from ${customerPhone}`)

  // Save to inbox immediately (merchant sees it in app)
  const savedId = await saveMessage(merchantId, customerPhone, customerName, text)

  // ── SHIELD 5: Quiet hours (11pm – 6am EAT) ───────────────
  if (m.config.quiet_hours !== false && isQuietHours()) {
    const delay = getQuietHoursDelay()
    logger.info(`🌙 Quiet hours — queued for ${Math.round(delay/60000)}min`)
    setTimeout(() => processReply(sock, merchantId, jid, customerPhone, text, savedId, msg.key.id), delay)
    return
  }

  // ── SHIELD 4: Daily volume ramp ───────────────────────────
  const botAge  = m.connectedAt
    ? Math.floor((Date.now() - new Date(m.connectedAt).getTime()) / 86400000)
    : 0
  const dayKey  = `daily:${merchantId}:${today()}`
  const count   = dailyCache.get(dayKey) || 0
  const maxDay  = getDailyLimit(botAge)

  if (count >= maxDay) {
    logger.warn(`⛔ [${merchantId}] Daily limit ${count}/${maxDay} — skipping`)
    return  // merchant sees msg in app, replies manually
  }

  // ── SHIELD 3: Human reading delay before typing starts ───────────────────
  // Simulates a person picking up their phone, reading the message, then typing.
  // Total reply time (read + type + send) stays within 45 seconds.
  const readDelay = humanReadDelay(text)
  logger.info(`⏱️  [${merchantId}] Read pause ${(readDelay/1000).toFixed(1)}s → then typing...`)
  setTimeout(() => processReply(sock, merchantId, jid, customerPhone, text, savedId, msg.key.id), readDelay)
}

// ── Generate reply via Edge Function and send ─────────────────
async function processReply(sock, merchantId, jid, customerPhone, text, savedId, msgKeyId) {
  const m = merchants.get(merchantId)
  if (!m?.connected) {
    logger.warn(`[${merchantId}] Skipping reply — disconnected`)
    return
  }

  try {
    // ── Call Supabase Edge Function for AI reply ─────────────
    // Your Groq key lives there — this server never touches it
    logger.info(`🤖 [${merchantId}] Calling Edge Function for reply...`)

    const aiRes = await fetch(AI_EDGE_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        merchant_id:      merchantId,
        customer_message: text,
        mode:             'auto'
      })
    })

    if (!aiRes.ok) throw new Error(`Edge Function error: ${aiRes.status}`)
    const { reply } = await aiRes.json()
    if (!reply) throw new Error('Empty reply from Edge Function')

    logger.info(`💬 [${merchantId}] Reply ready (${reply.length} chars)`)

    // ── SHIELD 2: Professional typing simulation ─────────────
    // Full sequence mimics a real person reading and replying:
    //   1. Mark message as read (shows blue ticks — real humans do this first)
    //   2. Brief "opening chat" pause (200–600ms)
    //   3. "Available" presence — they just opened the app
    //   4. "Composing" for realistic duration based on reply length:
    //      • Short reply  (<80 chars)  → 4–8 seconds typing
    //      • Medium reply (<180 chars) → 7–14 seconds typing
    //      • Long reply   (180+ chars) → 12–22 seconds typing
    //   5. "Paused" briefly — they're re-reading before send
    //   6. Message delivered
    // All within the 45s total window (readDelay + typing)
    await sock.readMessages([{ remoteJid: jid, id: msgKeyId || 'latest', fromMe: false }])
    await sleep(randomBetween(200, 600))                        // open chat
    await sock.sendPresenceUpdate('available', jid)
    await sleep(randomBetween(400, 900))                        // settle in

    const typingMs = replyTypingDuration(reply)
    await sock.sendPresenceUpdate('composing', jid)
    logger.info(`✍️  [${merchantId}] Typing for ${(typingMs/1000).toFixed(1)}s...`)
    await sleep(typingMs)                                       // typing...

    await sock.sendPresenceUpdate('paused', jid)
    await sleep(randomBetween(350, 750))                        // re-reading before send

    // Send the message
    await sock.sendMessage(jid, { text: reply })

    // Increment daily counter
    const dayKey = `daily:${merchantId}:${today()}`
    dailyCache.set(dayKey, (dailyCache.get(dayKey) || 0) + 1)

    // Update inbox record
    if (savedId) {
      await sb.from('inbox_messages').update({
        ai_draft:   reply,
        status:     'replied',
        replied_at: new Date().toISOString()
      }).eq('id', savedId)
    }

    logger.info(`✅ [${merchantId}] Sent to ${customerPhone}`)

  } catch (err) {
    logger.error(`❌ [${merchantId}] Reply failed: ${err.message}`)
  }
}

// ── Save incoming message to Supabase inbox ───────────────────
async function saveMessage(merchantId, customerPhone, customerName, text) {
  try {
    const { data } = await sb.from('inbox_messages').insert({
      merchant_id:      merchantId,
      customer_phone:   customerPhone,
      customer_name:    customerName,
      customer_message: text,
      status:           'pending',
      source:           'whatsapp_bot'
    }).select('id').single()
    return data?.id || null
  } catch (e) {
    logger.warn('saveMessage failed:', e.message)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// SHIELD UTILITIES
// ═══════════════════════════════════════════════════════════════

function extractText(msg) {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
    || ''
}

// ── SHIELD 3: Human reading delay before typing starts ───────
// Simulates: person picks up phone, unlocks, opens WhatsApp, reads.
// Based on message length — longer message = more reading time.
// Total budget: we aim for the whole reply to land within 45s.
// readDelay + typingDuration + overhead must stay under 45s.
//
// readDelay ranges:
//   Short msg  (≤30 chars):  8–16 seconds
//   Medium msg (≤80 chars): 10–20 seconds
//   Long msg   (80+ chars): 12–23 seconds
function humanReadDelay(incomingText) {
  const len = (incomingText || '').length
  if (len <= 30) return randomBetween(8_000,  16_000)
  if (len <= 80) return randomBetween(10_000, 20_000)
  return             randomBetween(12_000, 23_000)
}

// ── SHIELD 2: Realistic typing duration based on reply length ─
// Humans type ~40–55 wpm on mobile. We simulate that pace.
// We also add small jitter so it never looks like an exact timer.
//
// Short  reply (<80 chars):  4–8  seconds  (quick answer)
// Medium reply (<180 chars): 7–14 seconds  (normal reply)
// Long   reply (180+ chars): 12–22 seconds (detailed response)
//
// Max is capped at 22s so total always stays under 45s.
function replyTypingDuration(replyText) {
  const len     = (replyText || '').length
  const jitter  = randomBetween(-800, 800)       // ±0.8s human variation
  if (len < 80)  return Math.max(4_000,  randomBetween(4_000,  8_000)  + jitter)
  if (len < 180) return Math.max(7_000,  randomBetween(7_000,  14_000) + jitter)
  return               Math.max(12_000, Math.min(randomBetween(12_000, 22_000) + jitter, 22_000))
}

// SHIELD 4: Ramp up slowly over first 2 weeks
function getDailyLimit(ageDays) {
  if (ageDays <= 3)  return 10
  if (ageDays <= 7)  return 25
  if (ageDays <= 14) return 50
  return parseInt(process.env.BOT_MAX_REPLIES || '100')
}

// SHIELD 5: Quiet hours — 11pm to 6am EAT
function isQuietHours() {
  const hour = parseInt(new Intl.DateTimeFormat('en', {
    hour: 'numeric', hour12: false, timeZone: 'Africa/Dar_es_Salaam'
  }).format(new Date()))
  return hour >= 23 || hour < 6
}

function getQuietHoursDelay() {
  const now    = new Date()
  const resume = new Date(now)
  resume.setHours(6, randomBetween(0, 20), randomBetween(0, 59))
  if (resume <= now) resume.setDate(resume.getDate() + 1)
  return (resume.getTime() - now.getTime()) + randomBetween(0, 600_000)
}

function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function sleep(ms)               { return new Promise(r => setTimeout(r, ms)) }
function today()                 { return new Date().toISOString().split('T')[0] }

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGINT', async () => {
  logger.info('Shutting down...')
  for (const [id, m] of merchants) {
    try { m.sock?.end() } catch {}
    await sb.from('profiles').update({ bot_connection_status: 'disconnected' }).eq('id', id)
  }
  process.exit(0)
})

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logger.info(`🤖 LinkaMarket Bot Server on port ${PORT}`)
  logger.info(`🧠 AI powered by Supabase Edge Function: ${AI_EDGE_URL}`)
  // BUG 1 FIX: Reconnect all previously-active merchants on startup
  await restoreSessions()
})
// ── BUG 1 FIX: Restore sessions on server restart ────────────────────────────
// When Render/Railway restarts, the in-memory `merchants` map is wiped but
// session files remain on disk. This reads Supabase for merchants marked
// 'connected' and re-initialises their socket so the bot replies again
// without the merchant needing to re-scan or re-pair.
async function restoreSessions() {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('id, whatsapp_number, bot_config')
      .eq('bot_connection_status', 'connected')

    if (error) { logger.warn('restoreSessions query error:', error.message); return }
    if (!data?.length) { logger.info('No sessions to restore'); return }

    logger.info(`🔄 Restoring ${data.length} merchant session(s) after restart...`)
    for (const row of data) {
      const phone = row.whatsapp_number
      if (!phone) { logger.warn(`[${row.id}] No phone stored — skipping restore`); continue }

      merchants.set(row.id, {
        connected:   false,
        connectedAt: null,
        config: {
          wa_number:   phone,
          auto_reply:  row.bot_config?.auto_reply  !== false,
          quiet_hours: row.bot_config?.quiet_hours !== false,
          ...(row.bot_config || {})
        }
      })
      try {
        await initBot(row.id, phone)
        logger.info(`✅ Restore started for [${row.id}]`)
      } catch(e) {
        logger.error(`❌ Restore failed for [${row.id}]: ${e.message}`)
      }
      // Stagger restores so we don't hammer WhatsApp all at once
      await sleep(randomBetween(3000, 7000))
    }
  } catch(e) {
    logger.error('restoreSessions error:', e.message)
  }
}
