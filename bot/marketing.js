import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

// ✅ FIXED: Relative imports for the same folder
import { buildMarketingContent } from './marketingAgent.js'
import { generateScene } from './imageGen.js'

const router = Router()
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const FREE_DAILY_LIMIT = 20

// POST /api/marketing/generate-poster
router.post('/generate-poster', async (req, res) => {
  try {
    const { merchantId, businessName, businessType, product, tone, cta, productImageBase64 } = req.body

    if (!merchantId || !businessName || !product) {
      return res.status(400).json({ success: false, error: 'Missing data' })
    }

    // 1. Groq Content
    const content = await buildMarketingContent({ businessName, businessType, product, tone, cta })

    // 2. RAM Optimization: If frontend already removed BG, finalProduct is just the input
    // We assume frontend @imgly returns a PNG.
    let finalProduct = productImageBase64; 

    // 3. Generate Background
    const sceneB64 = await generateScene(content.scenePrompt)

    res.json({
      success: true,
      data: {
        copy: content,
        canvasSettings: content.canvasSettings,
        sceneBase64: `data:image/png;base64,${sceneB64}`,
        productBase64: finalProduct
      }
    })
  } catch (error) {
    console.error('Poster Error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router