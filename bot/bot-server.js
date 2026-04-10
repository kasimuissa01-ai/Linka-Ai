import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import pino from 'pino'
import { normalizeMerchant } from './normalize.js'
import { buildPhotoshootPrompt } from './marketingAgent.js'
import { renderPoster, preloadFonts } from './posterRenderer.js'
import { TEMPLATES } from './index.js'

const app = express()
const PORT = process.env.PORT || 3000

// ─── Logger ───────────────────────────────────────────────────────────────────
const logger = pino({
  level: 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined
})

// ─── Preload fonts at startup ─────────────────────────────────────────────────
// Must be awaited — fonts are embedded as base64 in every SVG overlay.
// If fonts aren't loaded, all text renders in fallback sans-serif.
(async () => {
  try {
    await preloadFonts()                                                // ✅ fixed: no args, async
    logger.info(`✅ Fonts preloaded. ${Object.keys(TEMPLATES).length} templates ready.`)
  } catch (err) {
    logger.warn({ err }, '⚠️  Font preload failed — text will use system fallback fonts')
  }
})()

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))

// ─── POST /api/create-poster ──────────────────────────────────────────────────
app.post('/api/create-poster', async (req, res) => {
  const start = Date.now()

  try {
    // 1. Normalize: translate Swahili fields, validate, set defaults
    const merchantData = normalizeMerchant(req.body)
    logger.info({
      businessName: merchantData.businessName,
      style: merchantData.style,
      templateId: merchantData.templateId,
      offerPhrase: merchantData.offerPhrase
    }, 'Normalized merchant data')

    // 2. Build AI image prompt via Groq (no businessName, no text instructions)
    const prompt = await buildPhotoshootPrompt(merchantData)
    logger.info({ promptLength: prompt.length }, 'Prompt built')

    // 3. Resolve template — allow frontend override, fall back to style map
    const templateId = req.body.template || merchantData.templateId || 'kariakoo_bold'

    // 4. Render: fetch AI image + composite SVG text overlay
    const posterBuffer = await renderPoster({ prompt, templateId, data: merchantData })

    const duration = Date.now() - start
    logger.info(`✅ Poster generated in ${duration}ms for "${merchantData.businessName}"`)

    res
      .set('Content-Type', 'image/png')
      .set('X-Generation-Time', String(duration))
      .set('X-Template-Id', templateId)
      .send(posterBuffer)

  } catch (err) {
    logger.error({ err }, 'Poster generation failed')
    res.status(500).json({
      error: 'Tumeshindwa kutengeneza tangazo. Jaribu tena.',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined
    })
  }
})

// ─── GET /api/templates ───────────────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
  const publicTemplates = Object.entries(TEMPLATES).map(([id, t]) => ({
    id,                                                                 // ✅ fixed: use map key directly
    name: t.name,
    category: t.category || 'general',
    preview: `/previews/${id}.png`
  }))
  res.json(publicTemplates)
})

// ─── GET /api/preview-meta (debug only) ──────────────────────────────────────
// Returns normalized data + prompt as JSON. No image rendered. Useful for testing.
app.get('/api/preview-meta', async (req, res) => {
  try {
    const data = normalizeMerchant(req.query)
    const prompt = await buildPhotoshootPrompt(data)
    res.json({ data, prompt })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET / (health check) ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    engine: 'Pollinations + Sharp Template Renderer',
    templates: Object.keys(TEMPLATES).length,
    language: 'Swahili / English'
  })
})

// ─── Memory watchdog ──────────────────────────────────────────────────────────
setInterval(() => {
  const mb = process.memoryUsage().rss / 1024 / 1024
  if (mb > 420) {
    logger.warn(`📊 Memory high: ${Math.round(mb)}MB — requesting GC`)
    if (global.gc) global.gc()
  }
}, 10000)

// ─── Server ───────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info(`🚀 LinkaMarket Creative AI v2 on port ${PORT}`)
})

// GPT Image can take 15–25s. Keep generous timeout.
server.timeout = 120000
