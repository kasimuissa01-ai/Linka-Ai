import 'dotenv/config'
import express   from 'express'
import cors      from 'cors'
import { createClient } from '@supabase/supabase-js'
import pino      from 'pino'
import NodeCache from 'node-cache'
import marketingRoutes from './marketing.js' // This handles the Poster AI logic

// ─────────────────────────────────────────────────────────────
// EXPRESS SETUP
// ─────────────────────────────────────────────────────────────
const app  = express()
const PORT = process.env.PORT || 3000

app.use(cors())

// INCREASE LIMITS: Crucial for sending/receiving high-res Base64 images
app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ extended: true, limit: '20mb' }))

// ROUTE BRIDGE: This is where the Poster AI lives
app.use('/api/marketing', marketingRoutes)

// ─────────────────────────────────────────────────────────────
// LOGGER (Optimized for Production)
// ─────────────────────────────────────────────────────────────
const logger = pino({
  level: 'info',
  // In production, we remove pino-pretty to save RAM/CPU
  transport: process.env.NODE_ENV !== 'production' 
    ? { target: 'pino-pretty', options: { colorize: true } } 
    : undefined
})

// ─────────────────────────────────────────────────────────────
// SUPABASE & MEMORY
// ─────────────────────────────────────────────────────────────
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const merchants = new Map() 

// ─────────────────────────────────────────────────────────────
// MEMORY MANAGEMENT (CRITICAL FOR RENDER 512MB)
// ─────────────────────────────────────────────────────────────
/**
 * Since Render free tier has low RAM, we must prevent 
 * the 'merchants' map from growing too large.
 */
function cleanupMemory() {
    const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    logger.info(`📊 Current RAM Usage: ${Math.round(memUsage)}MB`);

    if (memUsage > 400) { // Danger zone for 512MB limit
        logger.warn('⚠️ RAM high, clearing inactive bot sessions...');
        for (const [id, m] of merchants) {
            if (!m.connected) {
                merchants.delete(id); // Remove sessions that aren't actively chatty
            }
        }
    }
}
setInterval(cleanupMemory, 10 * 60 * 1000); // Check every 10 mins

// ... (Keep your existing Session Helpers: tmpPath, loadSession, saveSession) ...

// ─────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────

app.get('/status', (req, res) => {
  const mid = req.query.merchant_id;
  const m = merchants.get(mid);
  
  res.json({
    connected: m?.connected === true,
    merchantsActive: merchants.size,
    // Add memory info to debug Render crashes
    serverMemory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB'
  });
});

// ─────────────────────────────────────────────────────────────
// STARTUP
// ─────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logger.info(`🚀 LinkaMarket Production Server running on ${PORT}`);
  
  // Only restore sessions if RAM allows
  const startMem = process.memoryUsage().rss / 1024 / 1024;
  if (startMem < 300) {
      await restoreSessions();
  } else {
      logger.error('❌ Not enough RAM to restore all sessions at once');
  }
});