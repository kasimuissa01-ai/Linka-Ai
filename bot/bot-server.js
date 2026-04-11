import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { normalizeMerchant } from './normalize.js'
import { buildPhotoshootPrompt } from './marketingAgent.js'
import { renderPoster, preloadFonts } from './posterRenderer.js'
import { TEMPLATES } from './index.js'

const app = express()
const PORT = process.env.PORT || 3000

// ─── Logger (no pino dependency) ─────────────────────────────────────────────
const logger = {
  info:  (...a) => console.log('[INFO]',  ...a),
  warn:  (...a) => console.warn('[WARN]', ...a),
  error: (...a) => console.error('[ERR]', ...a)
}

// ─── Preload fonts at startup ─────────────────────────────────────────────────
;(async () => {
  try {
    await preloadFonts()
    logger.info(`✅ Fonts preloaded. ${Object.keys(TEMPLATES).length} templates ready.`)
  } catch (err) {
    logger.warn('⚠️  Font preload failed — text will use system fallback fonts:', err.message)
  }
})()

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ─── POST /api/marketing/generate-poster ─────────────────────────────────────
// Matches what the frontend calls. Returns JSON with sceneUrl (base64 PNG).
app.post('/api/marketing/generate-poster', async (req, res) => {
  const start = Date.now()

  try {
    const merchantData = normalizeMerchant(req.body)
    logger.info(`Merchant: ${merchantData.businessName} | Style: ${merchantData.style} | Template: ${merchantData.templateId}`)

    const prompt = await buildPhotoshootPrompt(merchantData)
    logger.info(`Prompt built (${prompt.length} chars)`)

    const templateId = req.body.template || merchantData.templateId || 'kariakoo_bold'

    const posterBuffer = await renderPoster({ prompt, templateId, data: merchantData })

    const duration = Date.now() - start
    logger.info(`✅ Poster done in ${duration}ms for "${merchantData.businessName}"`)

    // Return JSON with base64 image — matches what frontend expects
    const base64 = posterBuffer.toString('base64')
    res.json({
      success: true,
      data: {
        photoshootUrl: `data:image/png;base64,${base64}`,
        sceneUrl:      `data:image/png;base64,${base64}`,
        scenePrompt:   prompt,
        templateId,
        usage: null
      }
    })

  } catch (err) {
    logger.error('Poster generation failed:', err.message)
    res.status(500).json({
      success: false,
      error: 'Tumeshindwa kutengeneza tangazo. Jaribu tena.',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined
    })
  }
})

// ─── GET /api/templates ───────────────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
  const publicTemplates = Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    category: t.category || 'general',
    preview: `/previews/${id}.png`
  }))
  res.json(publicTemplates)
})

// ─── GET /api/preview-meta (debug) ───────────────────────────────────────────
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

// GPT Image can take 15–25s
server.timeout = 120000
