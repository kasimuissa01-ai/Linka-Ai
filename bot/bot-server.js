import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import pino from 'pino'
import marketingRoutes from './marketing.js' 

const app = express()
const PORT = process.env.PORT || 3000

// 1. RAM Protection for Render (512MB limit)
const logger = pino({
  level: 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
})

// 2. Middleware: Increased limits for high-quality Base64 images
app.use(cors())
app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ extended: true, limit: '20mb' }))

// 3. Routes
app.use('/api/marketing', marketingRoutes)

// 4. Memory Watchdog
setInterval(() => {
    const memUsage = process.memoryUsage().rss / 1024 / 1024;
    if (memUsage > 420) {
        logger.warn(`📊 Memory High: ${Math.round(memUsage)}MB. Force cleaning...`);
        if (global.gc) global.gc();
    }
}, 10000);

// 5. Health Check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    engine: 'Flux-1 Designer',
    language: 'Swahili/English'
  })
})

const server = app.listen(PORT, () => {
  logger.info(`🚀 LinkaMarket Creative AI running on ${PORT}`);
})

// Increase timeout for AI generation (Flux can take 15-20s)
server.timeout = 120000;