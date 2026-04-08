import 'dotenv/config'
import express   from 'express'
import cors      from 'cors'
import pino      from 'pino'
import { createClient } from '@supabase/supabase-js'
import marketingRoutes from './marketing.js' 

const app  = express()
const PORT = process.env.PORT || 3000

// ── 1. INCREASE TIME LIMITS ───────────────────────────────
// AI Photoshoots take time. We tell Express to wait up to 2 minutes
// for the AI to finish before giving up.
const server = app.listen(PORT, () => {
  console.log(`🚀 AI Photoshoot Server running on port ${PORT}`);
})
server.timeout = 120000; // 120 seconds

// ── 2. MIDDLEWARE & LIMITS ────────────────────────────────
app.use(cors())

// High-res photos need big limits. 25MB is safe for all phone cameras.
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

// ── 3. ROUTES ──────────────────────────────────────────────
app.use('/api/marketing', marketingRoutes)

// ── 4. PRODUCTION LOGGER ──────────────────────────────────
const logger = pino({
  level: 'info',
  // Disable pretty logs in production to save RAM
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
})

// ── 5. RENDER RAM PROTECTION (CRITICAL) ───────────────────
// Since we are handling large image buffers, we must clear RAM often
function memoryGuard() {
    const usage = process.memoryUsage().rss / 1024 / 1024;
    if (usage > 400) {
        logger.warn(`📊 High RAM Usage: ${Math.round(usage)}MB. Clearing caches...`);
        // If your Node version supports it, this helps clear unused image data
        if (global.gc) global.gc(); 
    }
}
setInterval(memoryGuard, 15000); // Check every 15 seconds

// ── 6. HEALTH CHECK ───────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    engine: 'Stable Diffusion XL (SDXL)',
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB'
  })
})