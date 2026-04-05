import { Router }                from 'express'
import { createClient }          from '@supabase/supabase-js'
import { buildMarketingContent } from './marketingAgent.js'
import { generateScene }         from './imageGen.js'

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
  const { data, error } = await sb
    .from('image_usage').select('count')
    .eq('merchant_id', merchantId).eq('date', todayDate()).maybeSingle()
  if (error || !data) return 0
  return data.count
}

async function incrementDailyUsage(merchantId) {
  const current = await getDailyUsage(merchantId)
  await sb.from('image_usage').upsert(
    { merchant_id: merchantId, date: todayDate(), count: current + 1, updated_at: new Date().toISOString() },
    { onConflict: 'merchant_id,date' }
  )
}

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
// POST /api/marketing/generate-poster  (PRIMARY endpoint)
// ─────────────────────────────────────────────────────────────
router.post('/generate-poster', async (req, res) => {
  try {
    const {
      merchantId, businessName, businessType, product,
      tone, targetAudience, cta, productImageBase64,
    } = req.body

    // ── Validate required fields ──────────────────────────────
    if (!merchantId || !businessName || !businessType || !product) {
      return res.status(400).json({
        success: false,
        error: 'Required: merchantId, businessName, businessType, product',
      })
    }

    // ── Check daily limit ─────────────────────────────────────
    const usageToday = await getDailyUsage(merchantId)
    if (usageToday >= FREE_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        error:   `Daily limit reached (${FREE_DAILY_LIMIT}/day). Resets at midnight.`,
        usage:   { used: usageToday, limit: FREE_DAILY_LIMIT, remaining: 0 },
      })
    }

    console.log(`[Marketing] Poster pipeline: ${businessName} | ${merchantId}`)

    // ── FIX #1: Validate + clean product image base64 ─────────
    let cleanProductBase64 = null
    if (productImageBase64) {
      // Strip data URL prefix e.g. "data:image/png;base64,"
      cleanProductBase64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '')

      // Validate it's a real image (min 1KB)
      if (cleanProductBase64.length < 1000) {
        console.warn('[Marketing] Product image too small — ignoring')
        cleanProductBase64 = null
      }

      // Validate base64 characters
      if (cleanProductBase64 && !/^[A-Za-z0-9+/=]+$/.test(cleanProductBase64.slice(0, 100))) {
        console.warn('[Marketing] Invalid base64 — ignoring product image')
        cleanProductBase64 = null
      }
    }

    // ── Step 1: Groq generates content ───────────────────────
    console.log('[Marketing] Step 1: Groq...')
    const content = await buildMarketingContent({
      businessName, businessType, product, tone, targetAudience, cta,
    })
    console.log('[Marketing] Content:', JSON.stringify(content))

    // ── Step 2: Generate background scene ────────────────────
    console.log('[Marketing] Step 2: Generating scene...')
    const sceneBase64 = await generateScene(content.scenePrompt)
    console.log('[Marketing] Scene ready!')

    // ── Step 3: Upload scene to Supabase ─────────────────────
    const sceneUrl = await uploadToStorage(sceneBase64, merchantId, 'scene')

    // ── Step 4: Track usage ───────────────────────────────────
    await incrementDailyUsage(merchantId)
    const newUsage = usageToday + 1

    await sb.from('image_history').insert({
      merchant_id: merchantId,
      prompt:      content.scenePrompt,
      image_url:   sceneUrl,
      business_name: businessName,
      product,
      created_at: new Date().toISOString(),
    }).catch(e => console.warn('[Marketing] History insert failed:', e.message))

    console.log(`[Marketing] Done! ${newUsage}/${FREE_DAILY_LIMIT} today`)

    // ── Return all assets to frontend Canvas ─────────────────
    return res.status(200).json({
      success: true,
      data: {
        // Scene background (always present)
        sceneBase64: `data:image/png;base64,${sceneBase64}`,
        sceneUrl,

        // Product image — returned as-is (Canvas will frame it)
        // null if no product image was provided or validation failed
        productBase64: cleanProductBase64
          ? `data:image/png;base64,${cleanProductBase64}`
          : null,

        // Copy text for Canvas
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
      error: error.message || 'Poster generation failed. Please try again.',
    })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/marketing/generate-image  (legacy — kept working)
// ─────────────────────────────────────────────────────────────
router.post('/generate-image', async (req, res) => {
  try {
    const { merchantId, businessName, businessType, product, tone, targetAudience } = req.body
    if (!merchantId || !businessName || !businessType || !product) {
      return res.status(400).json({ success: false, error: 'Required fields missing' })
    }
    const usageToday = await getDailyUsage(merchantId)
    if (usageToday >= FREE_DAILY_LIMIT) {
      return res.status(429).json({ success: false, error: 'Daily limit reached', usage: { used: usageToday, limit: FREE_DAILY_LIMIT, remaining: 0 } })
    }
    const content   = await buildMarketingContent({ businessName, businessType, product, tone, targetAudience })
    const base64    = await generateScene(content.scenePrompt)
    const publicUrl = await uploadToStorage(base64, merchantId, 'scene')
    await incrementDailyUsage(merchantId)
    const newUsage = usageToday + 1
    await sb.from('image_history').insert({ merchant_id: merchantId, prompt: content.scenePrompt, image_url: publicUrl, business_name: businessName, product, created_at: new Date().toISOString() }).catch(() => {})
    return res.status(200).json({
      success: true,
      data: { imageUrl: publicUrl, imageBase64: `data:image/png;base64,${base64}`, prompt: content.scenePrompt, copy: content, usage: { used: newUsage, limit: FREE_DAILY_LIMIT, remaining: FREE_DAILY_LIMIT - newUsage } },
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
    return res.status(200).json({ success: true, data: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used), resetsAt: 'midnight UTC' } })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/marketing/history/:merchantId
// ─────────────────────────────────────────────────────────────
router.get('/history/:merchantId', async (req, res) => {
  try {
    const { data, error } = await sb.from('image_history').select('*')
      .eq('merchant_id', req.params.merchantId)
      .order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    return res.status(200).json({ success: true, data })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

export default router
