import { Router }                from 'express'
import { createClient }          from '@supabase/supabase-js'
import { buildMarketingContent } from './marketingAgent.js'
import { removeBackground, generateScene } from './imageGen.js'

const router = Router()

const sb = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
  { auth: { persistSession: false } }
)

const FREE_DAILY_LIMIT = 20

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function todayDate() {
  return new Date().toISOString().split('T')[0]
}

async function getDailyUsage(merchantId) {
  const { data, error } = await sb
    .from('image_usage')
    .select('count')
    .eq('merchant_id', merchantId)
    .eq('date', todayDate())
    .maybeSingle()
  if (error || !data) return 0
  return data.count
}

async function incrementDailyUsage(merchantId) {
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
}

// Upload base64 image to Supabase storage
async function uploadToStorage(base64, merchantId, suffix) {
  try {
    const fileName   = `marketing/${merchantId}/${Date.now()}-${suffix}.png`
    const imageBytes = Buffer.from(base64, 'base64')
    const { error }  = await sb.storage
      .from('merchant-images')
      .upload(fileName, imageBytes, { contentType: 'image/png', upsert: false })
    if (error) { console.warn('[Marketing] Upload failed:', error.message); return null }
    const { data } = sb.storage.from('merchant-images').getPublicUrl(fileName)
    return data?.publicUrl || null
  } catch (e) {
    console.warn('[Marketing] Upload error:', e.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/marketing/generate-poster
// NEW endpoint — full branded poster pipeline
// Accepts multipart/form-data OR JSON
// ─────────────────────────────────────────────────────────────
router.post('/generate-poster', async (req, res) => {
  try {
    const {
      merchantId,
      businessName,
      businessType,
      product,
      tone,
      targetAudience,
      cta,
      productImageBase64, // optional: base64 of merchant's product photo
    } = req.body

    // Validate
    if (!merchantId || !businessName || !businessType || !product) {
      return res.status(400).json({
        success: false,
        error: 'Required: merchantId, businessName, businessType, product',
      })
    }

    // Check daily limit
    const usageToday = await getDailyUsage(merchantId)
    if (usageToday >= FREE_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        error:   `Daily limit reached (${FREE_DAILY_LIMIT}/day). Resets at midnight.`,
        usage:   { used: usageToday, limit: FREE_DAILY_LIMIT, remaining: 0 },
      })
    }

    console.log(`[Marketing] Starting poster pipeline for: ${businessName} | ${merchantId}`)

    // ── STEP 1: Groq generates structured content ──────────
    console.log('[Marketing] Step 1: Groq generating content...')
    const content = await buildMarketingContent({
      businessName, businessType, product, tone, targetAudience, cta,
    })
    console.log('[Marketing] Content:', JSON.stringify(content))

    // ── STEP 2: Background removal (if product image provided) ──
    let transparentProductBase64 = null
    if (productImageBase64) {
      console.log('[Marketing] Step 2: Removing product background...')
      try {
        // Strip data URL prefix if present
        const cleanBase64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '')
        transparentProductBase64 = await removeBackground(cleanBase64)
        console.log('[Marketing] Background removed!')
      } catch (e) {
        // Background removal failed — continue without it
        console.warn('[Marketing] Background removal failed:', e.message)
        // Still use original image without transparent bg
        transparentProductBase64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '')
      }
    }

    // ── STEP 3: Generate background scene ──────────────────
    console.log('[Marketing] Step 3: Generating background scene...')
    const sceneBase64 = await generateScene(content.scenePrompt)
    console.log('[Marketing] Scene generated!')

    // ── STEP 4: Upload assets to Supabase Storage ──────────
    console.log('[Marketing] Step 4: Uploading assets...')
    const [sceneUrl, productUrl] = await Promise.all([
      uploadToStorage(sceneBase64, merchantId, 'scene'),
      transparentProductBase64
        ? uploadToStorage(transparentProductBase64, merchantId, 'product')
        : Promise.resolve(null),
    ])

    // ── STEP 5: Track usage + save history ─────────────────
    await incrementDailyUsage(merchantId)
    const newUsage = usageToday + 1

    await sb.from('image_history').insert({
      merchant_id:   merchantId,
      prompt:        content.scenePrompt,
      image_url:     sceneUrl,
      business_name: businessName,
      product:       product,
      created_at:    new Date().toISOString(),
    })

    console.log(`[Marketing] Pipeline done! ${newUsage}/${FREE_DAILY_LIMIT} today`)

    // ── RETURN: All assets + copy text to frontend ──────────
    // Frontend Canvas will compose the final poster
    return res.status(200).json({
      success: true,
      data: {
        // Background scene
        sceneBase64:   `data:image/png;base64,${sceneBase64}`,
        sceneUrl,

        // Product with transparent background (if provided)
        productBase64: transparentProductBase64
          ? `data:image/png;base64,${transparentProductBase64}`
          : null,
        productUrl,

        // Copy text for Canvas
        copy: {
          headline:     content.headline,
          subtext:      content.subtext,
          cta:          content.cta,
          businessName: businessName,
        },

        // Scene prompt for reference
        scenePrompt: content.scenePrompt,

        usage: {
          used:      newUsage,
          limit:     FREE_DAILY_LIMIT,
          remaining: FREE_DAILY_LIMIT - newUsage,
        },
      },
    })

  } catch (error) {
    console.error('[Marketing] Pipeline error:', error.message)
    return res.status(500).json({
      success: false,
      error:   error.message || 'Poster generation failed. Please try again.',
    })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/marketing/generate-image
// Legacy endpoint — kept for backward compatibility
// ─────────────────────────────────────────────────────────────
router.post('/generate-image', async (req, res) => {
  try {
    const { merchantId, businessName, businessType, product, tone, targetAudience } = req.body

    if (!merchantId || !businessName || !businessType || !product) {
      return res.status(400).json({ success: false, error: 'Required: merchantId, businessName, businessType, product' })
    }

    const usageToday = await getDailyUsage(merchantId)
    if (usageToday >= FREE_DAILY_LIMIT) {
      return res.status(429).json({ success: false, error: `Daily limit reached.`, usage: { used: usageToday, limit: FREE_DAILY_LIMIT, remaining: 0 } })
    }

    const content   = await buildMarketingContent({ businessName, businessType, product, tone, targetAudience })
    const base64    = await generateScene(content.scenePrompt)
    const publicUrl = await uploadToStorage(base64, merchantId, 'scene')

    await incrementDailyUsage(merchantId)
    const newUsage = usageToday + 1

    await sb.from('image_history').insert({
      merchant_id: merchantId, prompt: content.scenePrompt,
      image_url: publicUrl, business_name: businessName, product,
      created_at: new Date().toISOString(),
    })

    return res.status(200).json({
      success: true,
      data: {
        imageUrl:    publicUrl,
        imageBase64: `data:image/png;base64,${base64}`,
        prompt:      content.scenePrompt,
        copy:        content,
        usage:       { used: newUsage, limit: FREE_DAILY_LIMIT, remaining: FREE_DAILY_LIMIT - newUsage },
      },
    })
  } catch (error) {
    console.error('[Marketing] Error:', error.message)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/marketing/usage/:merchantId
// ─────────────────────────────────────────────────────────────
router.get('/usage/:merchantId', async (req, res) => {
  try {
    const used = await getDailyUsage(req.params.merchantId)
    return res.status(200).json({
      success: true,
      data: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used), resetsAt: 'midnight UTC' },
    })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/marketing/history/:merchantId
// ─────────────────────────────────────────────────────────────
router.get('/history/:merchantId', async (req, res) => {
  try {
    const { data, error } = await sb
      .from('image_history').select('*')
      .eq('merchant_id', req.params.merchantId)
      .order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    return res.status(200).json({ success: true, data })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

export default router
