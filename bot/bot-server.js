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
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

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

// ── Supabase ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  logger.error('Missing SUPABASE_URL or SUPABASE_KEY env vars')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
})

const AI_EDGE_URL = `${SUPABASE_URL}/functions/v1/ai-reply`

// ── In-memory state ───────────────────────────────────────────
const merchants  = new Map()
const dailyCache = new NodeCache({ stdTTL: 86400 })
const msgDedup   = new NodeCache({ stdTTL: 3600  })

// ═══════════════════════════════════════════════════════════════
// SESSION STORAGE IN SUPABASE
// ═══════════════════════════════════════════════════════════════

async function loadSessionFromSupabase(merchantId) {
  try {
    const { data, error } = await sb
      .from('bot_sessions')
      .select('session_data')
      .eq('merchant_id', merchantId)
      .single()
    if (error || !data) return null
    return data.session_data
  } catch (e) {
    logger.warn(`[${merchantId}] loadSession error: ${e.message}`)
    return null
  }
}

async function saveSessionToSupabase(merchantId, sessionData) {
  try {
    await sb.from('bot_sessions').upsert({
      merchant_id:  merchantId,
      session_data: sessionData,
      updated_at:   new Date().toISOString()
    }, { onConflict: 'merchant_id' })
  } catch (e) {
    logger.warn(`[${merchantId}] saveSession error: ${e.message}`)
  }
}

async function deleteSessionFromSupabase(merchantId) {
  try {
    await sb.from('bot_sessions').delete().eq('merchant_id', merchantId)
    logger.info(`[${merchantId}] 🗑️ Old session deleted from Supabase`)
  } catch (e) {
    logger.warn(`[${merchantId}] deleteSession error: ${e.message}`)
  }
}

async function useSupabaseAuthState(merchantId) {
  let sessionData = await loadSessionFromSupabase(merchantId)

  const sessPath = `/tmp/sessions/${merchantId}`
  mkdirSync(sessPath, { recursive: true })

  if (sessionData) {
    try {
      for (const [filename, fileContent] of Object.entries(sessionData)) {
        writeFileSync(join(sessPath, filename), JSON.stringify(fileContent), 'utf8')
      }
      logger.info(`[${merchantId}] ✅ Session loaded from Supabase`)
    } catch (e) {
      logger.warn(`[${merchantId}] Failed to write session to temp: ${e.message}`)
    }
  }

  const { state, saveCreds: _saveCreds } = await useMultiFileAuthState(sessPath)

  const saveCreds = async () => {
    await _saveCreds()
    try {
      const files = readdirSync(sessPath)
      const newSessionData = {}
      for (const file of files) {
        const raw = readFileSync(join(sessPath, file), 'utf8')
        try { newSessionData[file] = JSON.parse(raw) }
        catch { newSessionData[file] = raw }
      }
      await saveSessionToSupabase(merchantId, newSessionData)
    } catch (e) {
      logger.warn(`[${merchantId}] saveCreds sync failed: ${e.message}`)
    }
  }

  return { state, saveCreds }
}

// ═══════════════════════════════════════════════════════════════
// KEEP-ALIVE PING
// ═══════════════════════════════════════════════════════════════

function startKeepAlive() {
  const selfUrl  = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`
  const interval = 10 * 60 * 1000
  setInterval(async () => {
    try {
      const res = await fetch(`${selfUrl}/`)
      logger.info(`💓 Keep-alive ping → ${res.status}`)
    } catch (e) {
      logger.warn(`💓 Keep-alive failed: ${e.message}`)
    }
  }, interval)
  logger.info(`💓 Keep-alive started — pinging every 10 min → ${selfUrl}`)
}

// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.json({
    service:   'LinkaMarket WhatsApp Bot',
    status:    'running',
    merchants: merchants.size,
    uptime:    Math.floor(process.uptime()) + 's'
  })
})

app.get('/debug', (req, res) => {
  const state = {}
  for (const [id, m] of merchants) {
    state[id] = {
      connected:           m.connected,
      connectedAt:         m.connectedAt,
      phone:               m.config?.wa_number,
      auto_reply:          m.config?.auto_reply,
      quiet_hours:         m.config?.quiet_hours,
      currentlyQuietHours: isQuietHours()
    }
  }
  res.json({ merchants: state, ai_edge_url: AI_EDGE_URL })
})

app.post('/test-edge', async (req, res) => {
  const { merchant_id, message } = req.body
  if (!merchant_id || !message) return res.status(400).json({ error: 'merchant_id and message required' })
  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 20000)
    let aiRes
    try {
      aiRes = await fetch(AI_EDGE_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ merchant_id, customer_message: message, mode: 'auto' })
      })
    } finally { clearTimeout(timeout) }
    const body = await aiRes.text()
    res.json({ status: aiRes.status, ok: aiRes.ok, body: JSON.parse(body) })
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/status', (req, res) => {
  const merchantId = req.query.merchant_id || req.query.merchant
  if (!merchantId) return res.status(400).json({ error: 'merchant_id required' })
  const m      = merchants.get(merchantId)
  const botAge = m?.connectedAt
    ? Math.floor((Date.now() - new Date(m.connectedAt).getTime()) / 86400000)
    : 0
  const dayKey = `daily:${merchantId}:${today()}`
  res.json({
    connected:    m?.connected || false,
    merchants:    merchants.size,
    phone:        m?.config?.wa_number || '',
    today_count:  dailyCache.get(dayKey) || 0,
    daily_limit:  getDailyLimit(botAge),
    bot_age_days: botAge
  })
})

// ═══════════════════════════════════════════════════════════════
// /pair  ← THE MAIN FIX IS IN THIS FUNCTION
//
// THE BUG (what was happening):
//   1. User clicks "Pata Code"
//   2. Old expired session was still saved in bot_sessions table
//   3. Server loaded that old session → thought merchant was registered
//   4. Skipped generating a new code → returned { code: null }
//   5. Frontend received null → showed "Code haikuja" error
//
// THE FIX:
//   Delete the old session from Supabase BEFORE starting the bot.
//   Now Baileys always starts completely fresh → always generates
//   a real 8-character pairing code → user can connect.
// ═══════════════════════════════════════════════════════════════
app.post('/pair', async (req, res) => {
  const { phone, merchant_id } = req.body

  if (!phone || !merchant_id) {
    return res.status(400).json({ error: 'phone and merchant_id required' })
  }

  // 1. Close any existing socket
  if (merchants.has(merchant_id)) {
    try { merchants.get(merchant_id).sock?.end() } catch {}
    merchants.delete(merchant_id)
  }

  // 2. ✅ THE FIX: Delete old session so Baileys starts fresh
  await deleteSessionFromSupabase(merchant_id)

  // 3. Short pause to let socket fully close
  await sleep(1500)

  // 4. Fresh merchant entry
  merchants.set(merchant_id, {
    connected:   false,
    connectedAt: null,
    config: { wa_number: phone, auto_reply: true, quiet_hours: true }
  })

  // 5. Start bot — will now always generate a real pair code
  try {
    const code = await initBot(merchant_id, phone)

    if (code === 'already_registered') {
      logger.warn(`[${merchant_id}] ⚠️ Still got already_registered after delete — unexpected`)
      return res.json({ code: null, reconnecting: true, message: 'Bot inaungana tena — subiri sekunde 15' })
    }

    logger.info(`✅ Pair code for ${merchant_id}: ${code}`)
    res.json({ code, message: 'Enter this code in WhatsApp → Linked Devices' })
  } catch (err) {
    logger.error(`❌ Pair error for ${merchant_id}: ${err.message}`)
    merchants.delete(merchant_id)
    res.status(500).json({ error: err.message })
  }
})

app.post('/settings', async (req, res) => {
  const merchantId = req.headers['x-merchant-id'] || req.body.merchant_id
  const { setting, value } = req.body
  if (!merchantId) return res.status(401).json({ error: 'merchant_id required' })
  const m = merchants.get(merchantId)
  if (m?.config) {
    m.config[setting] = value
    logger.info(`[${merchantId}] Setting: ${setting} = ${value}`)
  }
  res.json({ ok: true })
})

app.post('/disconnect', async (req, res) => {
  const { merchant_id } = req.body
  if (!merchant_id) return res.status(400).json({ error: 'merchant_id required' })
  try { merchants.get(merchant_id)?.sock?.end() } catch {}
  merchants.delete(merchant_id)
  await deleteSessionFromSupabase(merchant_id)
  await sb.from('profiles').update({ bot_connection_status: 'disconnected' }).eq('id', merchant_id)
  res.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════
// WHATSAPP BOT CORE
// ═══════════════════════════════════════════════════════════════

async function initBot(merchantId, phone) {
  const { state, saveCreds } = await useSupabaseAuthState(merchantId)
  const { version }          = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger:                         pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    printQRInTerminal:              false,
    generateHighQualityLinkPreview: false,
    syncFullHistory:                false,
    markOnlineOnConnect:            false,
    getMessage: async () => undefined,
  })

  if (!merchants.has(merchantId)) {
    merchants.set(merchantId, {
      connected:   false,
      connectedAt: null,
      config: { wa_number: phone, auto_reply: true, quiet_hours: true }
    })
  }
  merchants.get(merchantId).sock = sock

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

      if (code === DisconnectReason.loggedOut) {
        logger.warn(`[${merchantId}] Logged out — deleting session, requires re-pair`)
        await deleteSessionFromSupabase(merchantId)
        merchants.delete(merchantId)
      } else {
        const delay = randomBetween(8000, 20000)
        logger.info(`⏳ [${merchantId}] Auto-reconnecting in ${Math.round(delay/1000)}s...`)
        setTimeout(async () => {
          try { await initBot(merchantId, phone) } catch(e) {
            logger.error(`Reconnect failed [${merchantId}]: ${e.message}`)
          }
        }, delay)
      }
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      await handleMessage(sock, merchantId, msg)
    }
  })

  if (!state.creds.registered) {
    await sleep(1500)
    const code = await sock.requestPairingCode(phone)
    return code
  }

  return 'already_registered'
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════

async function handleMessage(sock, merchantId, msg) {
  const m = merchants.get(merchantId)
  if (!m?.config)             return
  if (msg.key.fromMe)         return
  const jid = msg.key.remoteJid || ''
  if (jid.includes('@g.us'))  return
  if (jid.includes('@broadcast')) return
  if (jid === 'status@broadcast') return

  const text = extractText(msg)
  if (!text || text.trim().length < 2) return
  if (msgDedup.get(msg.key.id)) return
  msgDedup.set(msg.key.id, true)
  if (m.config.auto_reply === false) return

  const customerPhone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '')
  const customerName  = msg.pushName || null
  logger.info(`📨 [${merchantId}] "${text.slice(0,50)}" from ${customerPhone}`)

  const savedId = await saveMessage(merchantId, customerPhone, customerName, text)

  if (m.config.quiet_hours !== false && isQuietHours()) {
    const delay      = getQuietHoursDelay()
    const resumeTime = new Date(Date.now() + delay).toLocaleTimeString('en', { timeZone: 'Africa/Dar_es_Salaam' })
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
    logger.warn(`⛔ [${merchantId}] Daily limit ${count}/${maxDay} — skipping`)
    return
  }

  const readDelay = humanReadDelay(text)
  logger.info(`⏱️  [${merchantId}] Read pause ${(readDelay/1000).toFixed(1)}s...`)
  setTimeout(() => processReply(sock, merchantId, jid, customerPhone, text, savedId, msg.key.id), readDelay)
}

async function processReply(sock, merchantId, jid, customerPhone, text, savedId, msgKeyId) {
  const m = merchants.get(merchantId)
  if (!m?.connected) {
    logger.warn(`[${merchantId}] Skipping reply — disconnected`)
    return
  }

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 25000)
    let aiRes
    try {
      aiRes = await fetch(AI_EDGE_URL, {
        method:  'POST',
        signal:  controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body:    JSON.stringify({ merchant_id: merchantId, customer_message: text, mode: 'auto' })
      })
    } finally { clearTimeout(timeout) }

    const rawBody = await aiRes.text()
    logger.info(`🤖 Edge [${aiRes.status}]: ${rawBody.slice(0, 300)}`)
    if (!aiRes.ok) throw new Error(`Edge Function HTTP ${aiRes.status}: ${rawBody.slice(0, 200)}`)

    let parsed
    try { parsed = JSON.parse(rawBody) } catch(e) {
      throw new Error(`Edge returned invalid JSON: ${rawBody.slice(0, 100)}`)
    }

    const reply = parsed?.reply || parsed?.message || parsed?.response || ''
    if (!reply) throw new Error(`No reply field. Keys: ${Object.keys(parsed).join(', ')}`)

    await sock.readMessages([{ remoteJid: jid, id: msgKeyId || 'latest', fromMe: false }])
    await sleep(randomBetween(200, 600))
    await sock.sendPresenceUpdate('available', jid)
    await sleep(randomBetween(400, 900))
    const typingMs = replyTypingDuration(reply)
    await sock.sendPresenceUpdate('composing', jid)
    await sleep(typingMs)
    await sock.sendPresenceUpdate('paused', jid)
    await sleep(randomBetween(350, 750))
    await sock.sendMessage(jid, { text: reply })

    const dayKey = `daily:${merchantId}:${today()}`
    dailyCache.set(dayKey, (dailyCache.get(dayKey) || 0) + 1)

    if (savedId) {
      await sb.from('inbox_messages').update({
        ai_draft: reply, status: 'replied', replied_at: new Date().toISOString()
      }).eq('id', savedId)
    }
    logger.info(`✅ [${merchantId}] Sent to ${customerPhone}`)

  } catch (err) {
    logger.error(`❌ [${merchantId}] Reply failed: ${err.message}`)
    try {
      const fallback = 'Asante kwa ujumbe wako! 🙏 Tutakujibu hivi karibuni.'
      await sock.sendMessage(jid, { text: fallback })
      if (savedId) {
        await sb.from('inbox_messages').update({
          ai_draft: fallback, status: 'replied', replied_at: new Date().toISOString()
        }).eq('id', savedId)
      }
    } catch(e) {
      logger.error(`❌ [${merchantId}] Fallback also failed: ${e.message}`)
    }
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
  } catch (e) {
    logger.warn('saveMessage failed:', e.message)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// RESTORE SESSIONS ON STARTUP
// ═══════════════════════════════════════════════════════════════

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
      if (!phone) { logger.warn(`[${row.id}] No phone — skipping`); continue }

      const sessionData = await loadSessionFromSupabase(row.id)
      if (!sessionData) {
        logger.warn(`[${row.id}] No session in Supabase — marking disconnected`)
        await sb.from('profiles').update({ bot_connection_status: 'disconnected' }).eq('id', row.id)
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
        await initBot(row.id, phone)
        logger.info(`✅ Restored [${row.id}]`)
      } catch(e) {
        logger.error(`❌ Restore failed [${row.id}]: ${e.message}`)
      }
      await sleep(randomBetween(3000, 7000))
    }
  } catch(e) {
    logger.error('restoreSessions error:', e.message)
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function extractText(msg) {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
    || ''
}
function humanReadDelay(t) {
  const l = (t||'').length
  if (l<=30) return randomBetween(8000,16000)
  if (l<=80) return randomBetween(10000,20000)
  return randomBetween(12000,23000)
}
function replyTypingDuration(t) {
  const l=( t||'').length, j=randomBetween(-800,800)
  if (l<80)  return Math.max(4000,  randomBetween(4000,8000)+j)
  if (l<180) return Math.max(7000,  randomBetween(7000,14000)+j)
  return           Math.max(12000, Math.min(randomBetween(12000,22000)+j,22000))
}
function getDailyLimit(ageDays) {
  if (ageDays<=3)  return 10
  if (ageDays<=7)  return 25
  if (ageDays<=14) return 50
  return parseInt(process.env.BOT_MAX_REPLIES||'100')
}
function isQuietHours() {
  const h = parseInt(new Intl.DateTimeFormat('en',{
    hour:'numeric',hour12:false,timeZone:'Africa/Dar_es_Salaam'
  }).format(new Date()))
  return h>=23||h<6
}
function getQuietHoursDelay() {
  const now=new Date(), r=new Date(now)
  r.setHours(6,randomBetween(0,20),randomBetween(0,59))
  if (r<=now) r.setDate(r.getDate()+1)
  return (r.getTime()-now.getTime())+randomBetween(0,600000)
}
function randomBetween(min,max){return Math.floor(Math.random()*(max-min+1))+min}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function today(){return new Date().toISOString().split('T')[0]}

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
  logger.info(`🤖 LinkaMarket Bot on port ${PORT}`)
  logger.info(`🧠 AI Edge: ${AI_EDGE_URL}`)
  startKeepAlive()
  await restoreSessions()
})
