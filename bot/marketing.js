import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { buildMarketingContent } from './marketingAgent.js'
import { removeBackground, generateScene } from './imageGen.js'

const router = Router()

// Supabase Initialization
const sb = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
  { auth: { persistSession: false } }
)

const FREE_DAILY_LIMIT = 20

// ── UTILITIES ─────────────────────────────────────────────────

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

async function getDailyUsage(merchantId) {
  try {
    const { data, error } = await sb
      .from('image_usage')
      .select('count')
      .eq('merchant_id', merchantId)
      .eq('date', todayDate())
      .maybeSingle()
    if (error || !data) return 0
    return data.count
  } catch(e) {
    return 0
  }
}

async function incrementDailyUsage(merchantId) {
  try {
    const current = await getDailyUsage(merchantId)
    await sb.from('image_usage').upsert(
      {
        merchant_id: merchantId,
        date:        todayDate(),
        count:       current + 1,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'merchant_id,date' }
    )
  } catch(e) {
    console.warn('[Marketing] incrementDailyUsage error:', e.message)
  }
}

async function uploadToStorage(base64, merchantId, suffix) {
  try {
    if (!base64) return null
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '')
    const fileName = `marketing/${merchantId}/${Date.now()}-${suffix}.png`
    const imageBytes = Buffer.from(cleanBase64, 'base64')
    
    const { error } = await sb.storage
      .from('merchant-images')
      .upload(fileName, imageBytes, { contentType: 'image/png', upsert: false })
    
    if (error) throw error
    
    const { data } = sb.storage.from('merchant-images').getPublicUrl(fileName)
    return data?.publicUrl || null
  } catch (e) {
    console.warn('[Marketing] Upload failed:', e.message)
    return null
  }
}

async function saveToHistory(merchantId, scenePrompt, sceneUrl, businessName, product) {
  try {
    await sb.from('image_history').insert({
      merchant_id:   merchantId,
      prompt:        scenePrompt,
      image_url:     sceneUrl,
      business_name: businessName,
      product:       product,
      created_at:    new Date().toISOString(),
    })
  } catch(e) {
    console.warn('[Marketing] History log failed (Optional table missing?)')
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/marketing/generate-poster
// ─────────────────────────────────────────────────────────────
router.post('/generate-poster', async (req, res) => {
  try {
    const {
      merchantId, businessName, businessType, product,
      tone, targetAudience, cta, productImageBase64,
    } = req.body

    // 1. Validation
    if (!merchantId || !businessName || !product) {
      return res.status(400).json({ success: false, error: 'Missing required fields' })
    }

    // 2. Usage Check
    const usageToday = await getDailyUsage(merchantId)
    if (usageToday >= FREE_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        error: `Daily limit of ${FREE_DAILY_LIMIT} reached.`,
        usage: { used: usageToday, limit: FREE_DAILY_LIMIT, remaining: 0 }
      })
    }

    console.log(`[Poster AI] Pipeline started for: ${businessName}`)

    // 3. STEP 1: Groq AI - Professional Copy & Scene Prompt
    const content = await buildMarketingContent({
      businessName, businessType, product, tone, targetAudience, cta
    })

    // 4. STEP 2: Background Removal (RAM-Optimized Fallback)
    let finalProductB64 = productImageBase64
    
    // Logic: If frontend already sent a PNG (transparent), don't waste RAM processing it again
    const isAlreadyProcessed = productImageBase64?.includes('image/png')
    
    if (productImageBase64 && !isAlreadyProcessed) {
      console.log('[Poster AI] Server-side BG removal fallback...')
      try {
        const result = await removeBackground(productImageBase64)
        if (result) finalProductB64 = `data:image/png;base64,${result}`
      } catch (e) {
        console.warn('[Poster AI] BG removal failed, using original.')
      }
    }

    // 5. STEP 3: FLUX - Professional Background Generation
    const sceneB64 = await generateScene(content.scenePrompt)
    const formattedSceneB64 = `data:image/png;base64,${sceneB64}`

    // 6. STEP 4: Upload Assets in Parallel (Speed Improvement)
    const [sceneUrl, productUrl] = await Promise.all([
      uploadToStorage(sceneB64, merchantId, 'scene'),
      finalProductB64 ? uploadToStorage(finalProductB64, merchantId, 'product') : Promise.resolve(null)
    ])

    // 7. STEP 5: Finalize
    await incrementDailyUsage(merchantId)
    const newUsage = usageToday + 1

    // Non-blocking history save
    saveToHistory(merchantId, content.scenePrompt, sceneUrl, businessName, product).catch(() => {})

    // 8. Return to Frontend Canvas
    return res.json({
      success: true,
      data: {
        sceneBase64: formattedSceneB64,
        sceneUrl,
        productBase64: finalProductB64,
        productUrl,
        copy: {
          headline: content.headline,
          subtext: content.subtext,
          cta: content.cta,
          businessName
        },
        canvasSettings: content.canvasSettings, // Crucial for frontend coloring
        usage: {
          used: newUsage,
          limit: FREE_DAILY_LIMIT,
          remaining: FREE_DAILY_LIMIT - newUsage
        }
      }
    })

  } catch (error) {
    console.error('[Poster AI] Fatal Error:', error.message)
    res.status(500).json({ success: false, error: 'Pipeline failed: ' + error.message })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/marketing/usage/:merchantId
// ─────────────────────────────────────────────────────────────
router.get('/usage/:merchantId', async (req, res) => {
  try {
    const used = await getDailyUsage(req.params.merchantId)
    res.json({
      success: true,
      data: {
        used,
        limit: FREE_DAILY_LIMIT,
        remaining: Math.max(0, FREE_DAILY_LIMIT - used)
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router