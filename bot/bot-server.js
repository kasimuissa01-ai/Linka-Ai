import 'dotenv/config'
import express   from 'express'
import cors      from 'cors'
import pino      from 'pino'
import { createClient } from '@supabase/supabase-js'

// ── IMPORT FROM THE 'BOT' FOLDER ──────────────────────────
// This fixes the "Module Not Found" error that causes Status 1
import marketingRoutes from './bot/marketing.js' 

const app  = express()
const PORT = process.env.PORT || 3000

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(cors())

// Set limit to 20mb because Base64 images are large. 
// Without this, you get "Payload Too Large" errors.
app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ extended: true, limit: '20mb' }))

// ── ROUTES ──────────────────────────────────────────────────
app.use('/api/marketing', marketingRoutes)

// ── LOGGER (RAM OPTIMIZED) ──────────────────────────────────
// We disable 'pretty-print' in production to save memory
const logger = pino({
  level: 'info',
  transport: process.env.NODE_ENV !== 'production' 
    ? { target: 'pino-pretty', options: { colorize: true } } 
    : undefined
})

// ── SUPABASE (RAM OPTIMIZED) ────────────────────────────────
const sb = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_KEY || '',
  { auth: { persistSession: false } } // Saves RAM
)

// ── MEMORY WATCHDOG (FOR RENDER 512MB) ─────────────────────
// This prevents the server from being killed by Render for using too much RAM
function checkMemory() {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    if (used > 450) {
        logger.warn(`⚠️ High RAM usage: ${Math.round(used)}MB. Cleaning up...`);
        if (global.gc) global.gc(); // Manual cleanup if node is started with --expose-gc
    }
}
setInterval(checkMemory, 30000); // Check every 30 seconds

// ── BASIC ROUTES ────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'LinkaMarket-AI-Core',
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB'
  })
})

// ── START SERVER ────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📁 Marketing routes loaded from ./bot/marketing.js`);
})