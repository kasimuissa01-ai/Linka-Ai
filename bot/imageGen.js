const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN
const FLUX_MODEL    = '@cf/black-forest-labs/flux-1-schnell'

const RMBG_API_URL = process.env.RMBG_API_URL
  || process.env.OWN_REMBG_URL
  || 'https://linkamarket-bg-remover.onrender.com'

export async function removeBackground(imageBase64) {
  console.log('[RMBG] Starting...')
  console.log('[RMBG] Endpoint:', RMBG_API_URL + '/remove-bg-base64')

  const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '')
  if (!clean || clean.length < 100) {
    console.warn('[RMBG] Empty image — skipping')
    return null
  }

  console.log(`[RMBG] Sending ~${Math.round(clean.length / 1024)}KB...`)

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 90000)

  try {
    const response = await fetch(`${RMBG_API_URL}/remove-bg-base64`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_base64: clean }),
      signal:  controller.signal,
    })

    clearTimeout(timer)
    console.log(`[RMBG] HTTP ${response.status}`)

    if (!response.ok) {
      const txt = await response.text()
      console.error(`[RMBG] Error ${response.status}: ${txt.slice(0,200)}`)
      return null
    }

    const data = await response.json()
    const resultB64 = data.image_base64 || data.imageBase64 || ''

    if (!resultB64 || resultB64.length < 100) {
      console.error('[RMBG] No image in response. Keys:', Object.keys(data))
      return null
    }

    const finalB64 = resultB64.replace(/^data:image\/\w+;base64,/, '')
    console.log(`[RMBG] Done in ${data.processing_time_ms || '?'}ms`)
    return finalB64

  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      console.error('[RMBG] Timeout 90s — cold start, using original image')
    } else {
      console.error('[RMBG] Failed:', err.message)
    }
    return null
  }
}

export async function generateScene(scenePrompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN)
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN')

  console.log('[FLUX] Generating scene...')

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${FLUX_MODEL}`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ prompt: scenePrompt, num_steps: 8 }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`FLUX ${response.status}: ${err}`)
  }

  const json = await response.json()
  const b64  = json?.result?.image
  if (!b64) throw new Error('No image in FLUX response')

  console.log('[FLUX] Scene ready')
  return b64
}

export async function generateMarketingImage(prompt) {
  return generateScene(prompt)
}