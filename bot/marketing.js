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
    console.warn('[Marketing] getDailyUsage error:', e.message)
    return 0
  }
}

async function incrementDailyUsage(merchantId) {
  try {
    const current = await getDailyUsage(merchantId)
    const { error } = await sb.from('image_usage').upsert(
      {
        merchant_id: merchantId,
        date:        todayDate(),
        count:       current + 1,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'merchant_id,date' }
    )
    if (error) console.warn('[Marketing] incrementDailyUsage error:', error.message)
  } catch(e) {
    console.warn('[Marketing] incrementDailyUsage exception:', e.message)
  }
}

// ✅ FIX: uploadToStorage — no .catch(), uses try/catch
async function uploadToStorage(base64, merchantId, suffix) {
  try {
    const fileName   = `marketing/${merchantId}/${Date.now()}-${suffix}.png`
    const imageBytes = Buffer.from(base64, 'base64')
    const { error }  = await sb.storage
      .from('merchant-images')
      .upload(fileName, imageBytes, { contentType: 'image/png', upsert: false })
    if (error) {
      console.warn('[Marketing] Upload failed:', error.message)
      return null
    }
    const { data } = sb.storage.from('merchant-images').getPublicUrl(fileName)
    return data?.publicUrl || null
  } catch (e) {
    console.warn('[Marketing] Upload exception:', e.message)
    return null
  }
}

// ✅ FIX: saveToHistory — completely non-blocking, never crashes pipeline
// If image_history table doesn't exist yet, just logs and continues
async function saveToHistory(merchantId, scenePrompt, sceneUrl, businessName, product) {
  try {
    const { error } = await sb.from('image_history').insert({
      merchant_id:   merchantId,
      prompt:        scenePrompt,
      image_url:     sceneUrl,
      business_name: businessName,
      product:       product,
      created_at:    new Date().toISOString(),
    })
    if (error) {
      // Table might not exist yet — log but NEVER crash the pipeline
      console.warn('[Marketing] image_history insert failed:', error.message)
      console.warn('[Marketing] → Create image_history table in Supabase if it does not exist')
    }
  } catch(e) {
    // Absolutely never propagate — this is purely optional tracking
    console.warn('[Marketing] image_history exception:', e.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/marketing/generate-poster  ← Main endpoint
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate-poster', async (req, res) => {
  try {
    const {
      merchantId, businessName, businessType, product,
      tone, targetAudience, cta, productImageBase64,
    } = req.body

    if (!merchantId || !businessName || !businessType || !product) {
      return res.status(400).json({
        success: false,
        error: 'Required: merchantId, businessName, businessType, product',
      })
    }

    const usageToday = await getDailyUsage(merchantId)
    if (usageToday >= FREE_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        error:   `Daily limit reached (${FREE_DAILY_LIMIT}/day). Resets at midnight.`,
        usage:   { used: usageToday, limit: FREE_DAILY_LIMIT, remaining: 0 },
      })
    }

    console.log(`[Marketing] Poster pipeline: ${businessName} | ${merchantId}`)

    // ── Step 1: Groq generates structured content ──────────
    console.log('[Marketing] Step 1: Groq...')
    const content = await buildMarketingContent({
      businessName, businessType, product, tone, targetAudience, cta,
    })
    console.log('[Marketing] Content:', JSON.stringify(content))

    // ── Step 2: Background removal (if product image provided) ──
    let transparentProductBase64 = null
    if (productImageBase64) {
      console.log('[Marketing] Step 2: Removing background...')
      try {
        const cleanBase64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '')
        transparentProductBase64 = await removeBackground(cleanBase64)
        if (transparentProductBase64) {
          console.log('[Marketing] Background removed!')
        } else {
          console.warn('[Marketing] BG removal returned null — using original image')
          transparentProductBase64 = cleanBase64
        }
      } catch (e) {
        console.warn('[Marketing] BG removal failed (continuing):', e.message)
        transparentProductBase64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '')
      }
    }

    // ── Step 3: Generate background scene ──────────────────
    console.log('[Marketing] Step 3: Generating scene...')
    const sceneBase64 = await generateScene(content.scenePrompt)
    console.log('[Marketing] Scene generated!')

    // ── Step 4: Upload to Supabase Storage ─────────────────
    console.log('[Marketing] Step 4: Uploading...')
    const [sceneUrl, productUrl] = await Promise.all([
      uploadToStorage(sceneBase64, merchantId, 'scene'),
      transparentProductBase64
        ? uploadToStorage(transparentProductBase64, merchantId, 'product')
        : Promise.resolve(null),
    ])

    // ── Step 5: Track usage ─────────────────────────────────
    await incrementDailyUsage(merchantId)
    const newUsage = usageToday + 1

    // ── Step 6: Save to history — NON-BLOCKING, never crashes ──
    // ✅ KEY FIX: saveToHistory is wrapped in its own try/catch internally
    // If image_history table doesn't exist → logs warning, pipeline continues
    saveToHistory(merchantId, content.scenePrompt, sceneUrl, businessName, product)
      .catch(e => console.warn('[Marketing] saveToHistory unhandled:', e.message))

    console.log(`[Marketing] Done! ${newUsage}/${FREE_DAILY_LIMIT} today`)

    // ── Return all assets to frontend canvas ───────────────
    return res.status(200).json({
      success: true,
      data: {
        sceneBase64:   `data:image/png;base64,${sceneBase64}`,
        sceneUrl,
        productBase64: transparentProductBase64
          ? `data:image/png;base64,${transparentProductBase64}`
          : null,
        productUrl,
        copy: {
          headline:     content.headline,
          subtext:      content.subtext,
          cta:          content.cta,
          businessName: businessName,
        },
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
      error:   error.message || 'Poster generation failed.',
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/marketing/generate-image  ← Legacy endpoint kept
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate-image', async (req, res) => {
  try {
    const { merchantId, businessName, businessType, product, tone, targetAudience } = req.body
    if (!merchantId || !businessName || !businessType || !product) {
      return res.status(400).json({ success: false, error: 'Required fields missing' })
    }
    const usageToday = await getDailyUsage(merchantId)
    if (usageToday >= FREE_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        error: 'Daily limit reached',
        usage: { used: usageToday, limit: FREE_DAILY_LIMIT, remaining: 0 },
      })
    }
    const content   = await buildMarketingContent({ businessName, businessType, product, tone, targetAudience })
    const base64    = await generateScene(content.scenePrompt)
    const publicUrl = await uploadToStorage(base64, merchantId, 'scene')
    await incrementDailyUsage(merchantId)
    const newUsage = usageToday + 1
    // ✅ FIX: non-blocking history save
    saveToHistory(merchantId, content.scenePrompt, publicUrl, businessName, product)
      .catch(() => {})
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketing/usage/:merchantId
// ─────────────────────────────────────────────────────────────────────────────
router.get('/usage/:merchantId', async (req, res) => {
  try {
    const used = await getDailyUsage(req.params.merchantId)
    return res.status(200).json({
      success: true,
      data: {
        used,
        limit:     FREE_DAILY_LIMIT,
        remaining: Math.max(0, FREE_DAILY_LIMIT - used),
        resetsAt:  'midnight UTC',
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketing/history/:merchantId
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history/:merchantId', async (req, res) => {
  try {
    const { data, error } = await sb
      .from('image_history')
      .select('*')
      .eq('merchant_id', req.params.merchantId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return res.status(200).json({ success: true, data })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

export default router