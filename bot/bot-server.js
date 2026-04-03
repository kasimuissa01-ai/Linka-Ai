import 'dotenv/config'
import express   from 'express'
import cors      from 'cors'
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import pino      from 'pino'
import NodeCache from 'node-cache'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import marketingRoutes from './marketing.js'

// ─────────────────────────────────────────────────────────────
// EXPRESS
// ─────────────────────────────────────────────────────────────
const app  = express()
const PORT = process.env.PORT || 3000
app.use(cors())
app.use(express.json())
app.use('/api/marketing', marketingRoutes)

// ─────────────────────────────────────────────────────────────
// LOGGER
// ─────────────────────────────────────────────────────────────
const logger = pino({
  level: 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
})

// ─────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''
if (!SUPABASE_URL || !SUPABASE_KEY) {
  logger.error('Missing SUPABASE_URL or SUPABASE_KEY')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const AI_EDGE_URL = `${SUPABASE_URL}/functions/v1/ai-reply`

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STATE
// ─────────────────────────────────────────────────────────────
const merchants  = new Map()   // active bot sessions
const dailyCache = new NodeCache({ stdTTL: 86400 })
const msgDedup   = new NodeCache({ stdTTL: 3600 })

// ═════════════════════════════════════════════════════════════
// SESSION HELPERS
// 
// HOW IT WORKS:
//   - On first pair: no session exists → Baileys generates a
//     fresh pairing code → user enters it in WhatsApp → connected
//   - On connect: creds are saved to both /tmp AND Supabase
//   - On restart: creds loaded from Supabase → written to /tmp
//     → Baileys reconnects automatically without a new code
//   - On re-pair: /tmp folder AND Supabase row are BOTH deleted
//     → Baileys starts completely fresh → new code every time
// ═════════════════════════════════════════════════════════════

function tmpPath(merchantId) {
  return `/tmp/wa_sessions/${merchantId}`
}

// Wipe the /tmp folder for this merchant completely
function clearTmpSession(merchantId) {
  const p = tmpPath(merchantId)
  try {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true })
    logger.info(`[${merchantId}] 🗑️ /tmp session cleared`)
  } catch(e) {
    logger.warn(`[${merchantId}] clearTmp error: ${e.message}`)
  }
}

// Load session JSON from Supabase and write files to /tmp
async function loadSession(merchantId) {
  try {
    const { data, error } = await sb
      .from('bot_sessions')
      .select('session_data')
      .eq('merchant_id', merchantId)
      .maybeSingle()            // returns null if no row — never throws

    if (error) {
      logger.warn(`[${merchantId}] loadSession DB error: ${error.message}`)
      return false
    }
    if (!data?.session_data) return false

    // Write each session file to /tmp so Baileys can read them
    const p = tmpPath(merchantId)
    mkdirSync(p, { recursive: true })
    for (const [filename, content] of Object.entries(data.session_data)) {
      writeFileSync(join(p, filename), JSON.stringify(content), 'utf8')
    }
    logger.info(`[${merchantId}] ✅ Session loaded from Supabase`)
    return true
  } catch(e) {
    logger.warn(`[${merchantId}] loadSession error: ${e.message}`)
    return false
  }
}

// Read /tmp files and save them to Supabase
async function saveSession(merchantId) {
  try {
    const p = tmpPath(merchantId)
    if (!existsSync(p)) return

    const files = readdirSync(p)
    if (!files.length) return

    const sessionData = {}
    for (const file of files) {
      const raw = readFileSync(join(p, file), 'utf8')
      try { sessionData[file] = JSON.parse(raw) }
      catch { sessionData[file] = raw }
    }

    const { error } = await sb.from('bot_sessions').upsert({
      merchant_id:  merchantId,
      session_data: sessionData,
      updated_at:   new Date().toISOString()
    }, { onConflict: 'merchant_id' })

    if (error) logger.error(`[${merchantId}] saveSession DB error: ${error.message}`)
    else       logger.info(`[${merchantId}] 💾 Session saved to Supabase`)
  } catch(e) {
    logger.warn(`[${merchantId}] saveSession error: ${e.message}`)
  }
}

// Delete from Supabase
async function deleteSession(merchantId) {
  try {
    await sb.from('bot_sessions').delete().eq('merchant_id', merchantId)
    logger.info(`[${merchantId}] 🗑️ Session deleted from Supabase`)
  } catch(e) {
    logger.warn(`[${merchantId}] deleteSession error: ${e.message}`)
  }
}

// Full wipe: both /tmp AND Supabase
async function nukeSession(merchantId) {
  clearTmpSession(merchantId)
  await deleteSession(merchantId)
}

// ─────────────────────────────────────────────────────────────
// KEEP-ALIVE (prevents Render from sleeping)
// ─────────────────────────────────────────────────────────────
function startKeepAlive() {
  const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`
  setInterval(async () => {
    try {
      const r = await fetch(`${selfUrl}/`)
      logger.info(`💓 Keep-alive → ${r.status}`)
    } catch(e) {
      logger.warn(`💓 Keep-alive failed: ${e.message}`)
    }
  }, 10 * 60 * 1000)
  logger.info(`💓 Keep-alive started → ${selfUrl}`)
}

// ═════════════════════════════════════════════════════════════
// API ROUTES
// ═════════════════════════════════════════════════════════════

// Health check
app.get('/', (req, res) => {
  res.json({
    service:   'LinkaMarket WhatsApp Bot',
    status:    'running',
    merchants: merchants.size,
    uptime:    Math.floor(process.uptime()) + 's'
  })
})

// Debug — see all connected merchants
app.get('/debug', (req, res) => {
  const out = {}
  for (const [id, m] of merchants) {
    out[id] = {
      connected:   m.connected,
      connectedAt: m.connectedAt,
      phone:       m.config?.wa_number,
    }
  }
  res.json({ merchants: out })
})

// Status for a specific merchant
app.get('/status', (req, res) => {
  const mid    = req.query.merchant_id || req.query.merchant
  if (!mid) return res.status(400).json({ error: 'merchant_id required' })
  const m      = merchants.get(mid)
  const botAge = m?.connectedAt
    ? Math.floor((Date.now() - new Date(m.connectedAt).getTime()) / 86400000)
    : 0
  res.json({
    connected:    m?.connected === true,
    merchants:    merchants.size,
    phone:        m?.config?.wa_number || '',
    today_count:  dailyCache.get(`daily:${mid}:${today()}`) || 0,
    daily_limit:  getDailyLimit(botAge),
    bot_age_days: botAge
  })
})

// ─────────────────────────────────────────────────────────────
// /pair  — THE MAIN ENDPOINT
//
// WHAT IT DOES (clean simple flow):
//   1. Kill any existing socket for this merchant
//   2. Wipe BOTH /tmp folder AND Supabase session completely
//   3. Wait for everything to close
//   4. Start Baileys fresh — no old data anywhere
//   5. Baileys sees no creds → calls requestPairingCode()
//   6. Returns a real 8-character code to the frontend
//   7. Merchant enters code in WhatsApp → bot connects
//
// RESULT: "already_registered" can NEVER happen because we
//         wiped all session data in step 2.
// ─────────────────────────────────────────────────────────────
app.post('/pair', async (req, res) => {
  const { phone, merchant_id } = req.body
  if (!phone || !merchant_id) {
    return res.status(400).json({ error: 'phone and merchant_id required' })
  }

  try {
    // Kill existing socket if any
    const existing = merchants.get(merchant_id)
    if (existing?.sock) {
      try { existing.sock.end() } catch {}
      merchants.delete(merchant_id)
      await sleep(2000)
    }

    // Wipe ALL session data — /tmp + Supabase
    await nukeSession(merchant_id)
    await sleep(1000)

    // Start fresh bot
    const code = await initBot(merchant_id, phone)
    return res.json({ code })

  } catch(e) {
    logger.error(`[${merchant_id}] /pair error: ${e.message}`)
    return res.status(500).json({ error: e.message })
  }
})

app.post('/disconnect', async (req, res) => {
  const { merchant_id } = req.body
  if (!merchant_id) return res.status(400).json({ error: 'merchant_id required' })

  const m = merchants.get(merchant_id)
  if (m?.sock) {
    try { m.sock.end() } catch {}
  }
  merchants.delete(merchant_id)
  await nukeSession(merchant_id)
  await sb.from('profiles')
    .update({ bot_connection_status: 'disconnected' })
    .eq('id', merchant_id)

  return res.json({ success: true })
})

// ═════════════════════════════════════════════════════════════
// BOT INIT
// ═════════════════════════════════════════════════════════════
async function initBot(merchantId, phone) {
  // Load session from Supabase → write to /tmp
  await loadSession(merchantId)

  const { version } = await fetchLatestBaileysVersion()
  const p           = tmpPath(merchantId)
  mkdirSync(p, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(p)

  const sock = makeWASocket({
    version,
    logger:        pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds:  state.creds,
      keys:   makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    generateHighQualityLinkPreview: false,
  })

  // Store socket reference
  const existing = merchants.get(merchantId) || {}
  merchants.set(merchantId, { ...existing, sock, connected: false })

  // Request pairing code
  let pairingCode = null
  if (!state.creds.registered) {
    const cleaned = phone.replace(/\D/g, '')
    await sleep(2000)
    pairingCode = await sock.requestPairingCode(cleaned)
    logger.info(`[${merchantId}] 🔑 Pairing code: ${pairingCode}`)
  }

  sock.ev.on('creds.update', async () => {
    await saveCreds()
    await saveSession(merchantId)
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'open') {
      const m = merchants.get(merchantId) || {}
      merchants.set(merchantId, {
        ...m,
        sock,
        connected:   true,
        connectedAt: m.connectedAt || new Date().toISOString(),
        config:      m.config || { wa_number: phone, auto_reply: true, quiet_hours: true },
      })
      await saveSession(merchantId)
      await sb.from('profiles')
        .update({ bot_connection_status: 'connected' })
        .eq('id', merchantId)
      logger.info(`[${merchantId}] ✅ Connected`)
    }

    if (connection === 'close') {
      const code   = lastDisconnect?.error?.output?.statusCode
      const reason = DisconnectReason
      logger.warn(`[${merchantId}] ⚠️ Disconnected — code ${code}`)

      const shouldReconnect = code !== reason.loggedOut && code !== 401 && code !== 403
      if (shouldReconnect) {
        logger.info(`[${merchantId}] 🔄 Reconnecting...`)
        await sleep(randomBetween(3000, 8000))
        try { await initBot(merchantId, phone) } catch(e) {
          logger.error(`[${merchantId}] Reconnect failed: ${e.message}`)
        }
      } else {
        logger.warn(`[${merchantId}] ❌ Logged out — clearing session`)
        await nukeSession(merchantId)
        merchants.delete(merchantId)
        await sb.from('profiles')
          .update({ bot_connection_status: 'disconnected' })
          .eq('id', merchantId)
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (msg.key.fromMe) continue
      if (!msg.key.remoteJid?.endsWith('@s.whatsapp.net')) continue
      const text = extractText(msg)
      if (!text) continue
      const dedupKey = `${merchantId}:${msg.key.id}`
      if (msgDedup.get(dedupKey)) continue
      msgDedup.set(dedupKey, true)
      await handleIncoming(sock, merchantId, msg, text)
    }
  })

  return pairingCode || 'already_registered'
}

// ─────────────────────────────────────────────────────────────
// INCOMING MESSAGE HANDLER
// ─────────────────────────────────────────────────────────────
async function handleIncoming(sock, merchantId, msg, text) {
  const m = merchants.get(merchantId)
  if (!m?.connected) return

  const jid           = msg.key.remoteJid
  const customerPhone = jid.replace('@s.whatsapp.net', '')
  const customerName  = msg.pushName || customerPhone

  logger.info(`[${merchantId}] 📩 From ${customerPhone}: ${text.slice(0, 60)}`)

  const savedId = await saveMessage(merchantId, customerPhone, customerName, text)

  if (!m.config?.auto_reply) return

  if (isQuietHours() && m.config?.quiet_hours) {
    const delay = getQuietHoursDelay()
    const resumeTime = new Date(Date.now() + delay)
      .toLocaleTimeString('en', { timeZone: 'Africa/Dar_es_Salaam' })
    logger.info(`🌙 [${merchantId}] Quiet hours — queued until ~${resumeTime} EAT`)
    setTimeout(() => processReply(sock, merchantId, jid, customerPhone, text, savedId, msg.key.id), delay)
    return
  }

  const botAge = m.connectedAt
    ? Math.floor((Date.now() - new Date(m.connectedAt).getTime()) / 86400000)
    : 0
  const dayKey = `daily:${merchantId}:${today()}`
  const count  = dailyCache.get(dayKey) || 0
  const maxDay = getDailyLimit(botAge)

  if (count >= maxDay) {
    logger.warn(`⛔ [${merchantId}] Daily limit ${count}/${maxDay}`)
    return
  }

  setTimeout(
    () => processReply(sock, merchantId, jid, customerPhone, text, savedId, msg.key.id),
    humanReadDelay(text)
  )
}

async function processReply(sock, merchantId, jid, customerPhone, text, savedId, msgKeyId) {
  const m = merchants.get(merchantId)
  if (!m?.connected) return

  try {
    const ctrl    = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 25000)
    let aiRes
    try {
      aiRes = await fetch(AI_EDGE_URL, {
        method:  'POST',
        signal:  ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body:    JSON.stringify({ merchant_id: merchantId, customer_message: text, mode: 'auto' })
      })
    } finally { clearTimeout(timeout) }

    const rawBody = await aiRes.text()
    if (!aiRes.ok) throw new Error(`Edge HTTP ${aiRes.status}: ${rawBody.slice(0,200)}`)

    const parsed = JSON.parse(rawBody)
    const reply  = parsed?.reply || parsed?.message || parsed?.response || ''
    if (!reply) throw new Error(`No reply field in Edge response`)

    await sock.readMessages([{ remoteJid: jid, id: msgKeyId || 'latest', fromMe: false }])
    await sleep(randomBetween(200, 600))
    await sock.sendPresenceUpdate('available', jid)
    await sleep(randomBetween(400, 900))
    await sock.sendPresenceUpdate('composing', jid)
    await sleep(replyTypingDuration(reply))
    await sock.sendPresenceUpdate('paused', jid)
    await sleep(randomBetween(350, 750))
    await sock.sendMessage(jid, { text: reply })

    dailyCache.set(`daily:${merchantId}:${today()}`,
      (dailyCache.get(`daily:${merchantId}:${today()}`) || 0) + 1)

    if (savedId) {
      await sb.from('inbox_messages').update({
        ai_draft: reply, status: 'replied', replied_at: new Date().toISOString()
      }).eq('id', savedId)
    }
    logger.info(`✅ [${merchantId}] Replied to ${customerPhone}`)

  } catch(err) {
    logger.error(`❌ [${merchantId}] Reply failed: ${err.message}`)
    try {
      const fallback = 'Asante kwa ujumbe wako! 🙏 Tutakujibu hivi karibuni.'
      await sock.sendMessage(jid, { text: fallback })
      if (savedId) {
        await sb.from('inbox_messages').update({
          ai_draft: fallback, status: 'replied', replied_at: new Date().toISOString()
        }).eq('id', savedId)
      }
    } catch(e) {}
  }
}

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
  } catch(e) {
    logger.warn('saveMessage failed:', e.message)
    return null
  }
}

// ═════════════════════════════════════════════════════════════
// RESTORE SESSIONS ON STARTUP
// Runs once when server starts — reconnects all merchants
// who were connected before the restart
// ═════════════════════════════════════════════════════════════
async function restoreSessions() {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('id, whatsapp_number, bot_config')
      .eq('bot_connection_status', 'connected')

    if (error) { logger.warn('restoreSessions error:', error.message); return }
    if (!data?.length) { logger.info('No sessions to restore'); return }

    logger.info(`🔄 Restoring ${data.length} session(s)...`)

    for (const row of data) {
      const phone = row.whatsapp_number
      if (!phone) {
        logger.warn(`[${row.id}] No phone number — skipping`)
        continue
      }

      // Check session data exists in Supabase
      const { data: sess } = await sb
        .from('bot_sessions')
        .select('merchant_id')
        .eq('merchant_id', row.id)
        .maybeSingle()

      if (!sess) {
        logger.warn(`[${row.id}] No saved session — marking disconnected`)
        await sb.from('profiles')
          .update({ bot_connection_status: 'disconnected' })
          .eq('id', row.id)
        continue
      }

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
        const result = await initBot(row.id, phone)
        if (result === 'already_registered') {
          logger.info(`✅ [${row.id}] Reconnecting in background...`)
        }
      } catch(e) {
        logger.error(`❌ Restore failed [${row.id}]: ${e.message}`)
      }

      await sleep(randomBetween(3000, 6000))
    }
  } catch(e) {
    logger.error('restoreSessions error:', e.message)
  }
}

// ═════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════

function extractText(msg) {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
    || ''
}
function humanReadDelay(t) {
  const l = (t||'').length
  if (l <= 30) return randomBetween(8000,  16000)
  if (l <= 80) return randomBetween(10000, 20000)
  return              randomBetween(12000, 23000)
}
function replyTypingDuration(t) {
  const l = (t||'').length, j = randomBetween(-800, 800)
  if (l < 80)  return Math.max(4000,  randomBetween(4000,  8000)  + j)
  if (l < 180) return Math.max(7000,  randomBetween(7000,  14000) + j)
  return              Math.max(12000, Math.min(randomBetween(12000, 22000) + j, 22000))
}
function getDailyLimit(ageDays) {
  if (ageDays <= 3)  return 10
  if (ageDays <= 7)  return 25
  if (ageDays <= 14) return 50
  return parseInt(process.env.BOT_MAX_REPLIES || '100')
}
function isQuietHours() {
  const h = parseInt(new Intl.DateTimeFormat('en', {
    hour: 'numeric', hour12: false, timeZone: 'Africa/Dar_es_Salaam'
  }).format(new Date()))
  return h >= 23 || h < 6
}
function getQuietHoursDelay() {
  const now = new Date(), r = new Date(now)
  r.setHours(6, randomBetween(0, 20), randomBetween(0, 59))
  if (r <= now) r.setDate(r.getDate() + 1)
  return (r.getTime() - now.getTime()) + randomBetween(0, 600000)
}
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function sleep(ms)               { return new Promise(r => setTimeout(r, ms)) }
function today()                 { return new Date().toISOString().split('T')[0] }

// ─────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  logger.info('Shutting down...')
  for (const [id, m] of merchants) {
    try { m.sock?.end() } catch {}
    await sb.from('profiles')
      .update({ bot_connection_status: 'disconnected' })
      .eq('id', id)
  }
  process.exit(0)
})

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logger.info(`🤖 LinkaMarket Bot — port ${PORT}`)
  logger.info(`🧠 AI Edge: ${AI_EDGE_URL}`)
  startKeepAlive()
  await restoreSessions()
})
