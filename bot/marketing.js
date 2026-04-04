import { Router }                 from 'express'
import { createClient }           from '@supabase/supabase-js'
import { buildMarketingPrompt }   from './marketingAgent.js'
import { generateMarketingImage } from './imageGen.js'

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

// ─────────────────────────────────────────────────────────────
// POST /api/marketing/generate-image
// ─────────────────────────────────────────────────────────────
router.post('/generate-image', async (req, res) => {
  try {
    const { merchantId, businessName, businessType, product, tone, targetAudience } = req.body

    if (!merchantId || !businessName || !businessType || !product) {
      return res.status(400).json({
        success: false,
        error:   'Required: merchantId, businessName, businessType, product',
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

    console.log(`[Marketing] Generating for: ${businessName} | ${merchantId}`)

    // Step 1 — Groq writes the prompt
    console.log('[Marketing] Step 1: Groq building prompt...')
    const imagePrompt = await buildMarketingPrompt({
      businessName, businessType, product, tone, targetAudience,
    })
    console.log('[Marketing] Prompt:', imagePrompt)

    // Step 2 — Cloudflare FLUX generates image
    console.log('[Marketing] Step 2: Cloudflare FLUX generating...')
    const base64Image = await generateMarketingImage(imagePrompt)
    console.log('[Marketing] Image ready!')

    // Step 3 — Upload to Supabase Storage
    const fileName   = `marketing/${merchantId}/${Date.now()}.png`
    const imageBytes = Buffer.from(base64Image, 'base64')

    let publicUrl = null
    const { error: uploadError } = await sb.storage
      .from('merchant-images')
      .upload(fileName, imageBytes, { contentType: 'image/png', upsert: false })

    if (!uploadError) {
      const { data: urlData } = sb.storage.from('merchant-images').getPublicUrl(fileName)
      publicUrl = urlData?.publicUrl
    } else {
      console.warn('[Marketing] Storage upload failed:', uploadError.message)
    }

    // Step 4 — Track usage + history
    await incrementDailyUsage(merchantId)
    const newUsage = usageToday + 1

    await sb.from('image_history').insert({
      merchant_id:   merchantId,
      prompt:        imagePrompt,
      image_url:     publicUrl,
      business_name: businessName,
      product:       product,
      created_at:    new Date().toISOString(),
    })

    console.log(`[Marketing] Done! ${newUsage}/${FREE_DAILY_LIMIT} today`)

    return res.status(200).json({
      success: true,
      data: {
        imageUrl:    publicUrl,
        imageBase64: `data:image/png;base64,${base64Image}`,
        prompt:      imagePrompt,
        usage: {
          used:      newUsage,
          limit:     FREE_DAILY_LIMIT,
          remaining: FREE_DAILY_LIMIT - newUsage,
        },
      },
    })

  } catch (error) {
    console.error('[Marketing] Error:', error.message)
    return res.status(500).json({
      success: false,
      error:   error.message || 'Image generation failed. Please try again.',
    })
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

// ─────────────────────────────────────────────────────────────
// GET /api/marketing/history/:merchantId
// ─────────────────────────────────────────────────────────────
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
