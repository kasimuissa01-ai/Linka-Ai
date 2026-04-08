import 'dotenv/config'
import express   from 'express'
import cors      from 'cors'
import pino      from 'pino'
import { createClient } from '@supabase/supabase-js'

// ✅ FIXED: Look in current folder, not /bot/bot/
import marketingRoutes from './marketing.js' 

const app  = express()
const PORT = process.env.PORT || 3000

app.use(cors())

// ✅ REQUIRED: Allow large images to be sent from Frontend
app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ extended: true, limit: '20mb' }))

app.use('/api/marketing', marketingRoutes)

// RAM Optimized Logger
const logger = pino({
  level: 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
})

// Memory Watchdog for Render 512MB
setInterval(() => {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    if (used > 450) logger.warn(`High Memory Usage: ${Math.round(used)}MB`);
}, 30000);

app.get('/', (req, res) => {
  res.json({ status: 'online', service: 'LinkaMarket-AI-Core' })
})

app.listen(PORT, () => {
  logger.info(`🚀 Bot Server running on port ${PORT}`);
})