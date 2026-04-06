const CF_ACCOUNT_ID  = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN   = process.env.CLOUDFLARE_API_TOKEN
const FLUX_MODEL     = '@cf/black-forest-labs/flux-1-schnell'

// Your BG remover service URL — set this in Render environment variables
// OWN_REMBG_URL = https://linkamarket-bg-remover.onrender.com
const OWN_REMBG_URL  = process.env.OWN_REMBG_URL || 'https://linkamarket-bg-remover.onrender.com'

function cfUrl(model) {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`
}
function cfHeaders() {
  return { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' }
}

// ─────────────────────────────────────────────────────────────────────
// removeBackground
// Calls your own u2netp service.
// Returns: base64 PNG string (transparent bg), or null on failure
// ─────────────────────────────────────────────────────────────────────
export async function removeBackground(imageBase64) {
  console.log('[BgRemoval] Calling own u2netp service...')

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 35000) // 35s timeout

  try {
    const res = await fetch(`${OWN_REMBG_URL}/remove-bg-base64`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_base64: imageBase64 }),
      signal:  controller.signal,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`BG remover HTTP ${res.status}: ${err}`)
    }

    const data = await res.json()

    if (!data.success || !data.image_base64) {
      throw new Error('BG remover returned no image')
    }

    console.log(`[BgRemoval] ✅ Done in ${data.processing_time_ms}ms`)
    return data.image_base64

  } catch (e) {
    console.warn(`[BgRemoval] Failed: ${e.message}`)
    // Return null — caller (marketing.js) will use original photo
    // Canvas compositor handles it with smart clip + blur effects
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// ─────────────────────────────────────────────────────────────────────
// generateScene — Cloudflare FLUX (unchanged)
// ─────────────────────────────────────────────────────────────────────
export async function generateScene(scenePrompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN)
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN')

  console.log('[ImageGen] Generating scene with FLUX...')

  const response = await fetch(cfUrl(FLUX_MODEL), {
    method:  'POST',
    headers: cfHeaders(),
    body:    JSON.stringify({ prompt: scenePrompt, num_steps: 8 }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`FLUX error ${response.status}: ${err}`)
  }

  const json = await response.json()
  const b64  = json?.result?.image
  if (!b64) throw new Error(`No image in FLUX response`)

  console.log('[ImageGen] ✅ Scene generated')
  return b64
}

export async function generateMarketingImage(prompt) {
  return generateScene(prompt)
}
