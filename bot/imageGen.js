const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN
const FLUX_MODEL    = '@cf/black-forest-labs/flux-1-schnell'

function cfUrl(model) {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`
}

function checkEnv() {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN')
  }
}

// ─────────────────────────────────────────────────────────────
// Generate background scene with FLUX
// Returns base64 PNG string
// ─────────────────────────────────────────────────────────────
export async function generateScene(scenePrompt) {
  checkEnv()
  console.log('[ImageGen] Generating scene...')

  const response = await fetch(cfUrl(FLUX_MODEL), {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      prompt:    scenePrompt,
      num_steps: 8,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Cloudflare FLUX error ${response.status}: ${err}`)
  }

  const json        = await response.json()
  const base64Scene = json?.result?.image

  if (!base64Scene) {
    throw new Error(`No image in Cloudflare response: ${JSON.stringify(json)}`)
  }

  console.log('[ImageGen] Scene generated!')
  return base64Scene
}

// ─────────────────────────────────────────────────────────────
// Legacy export — kept for backward compatibility
// ─────────────────────────────────────────────────────────────
export async function generateMarketingImage(prompt) {
  return generateScene(prompt)
}

// ─────────────────────────────────────────────────────────────
// removeBackground — stub that returns null
// Real bg removal requires paid API (remove.bg) or Sharp server-side
// Frontend Canvas uses smart-clip framing instead
// ─────────────────────────────────────────────────────────────
export async function removeBackground(imageBase64) {
  console.log('[ImageGen] Background removal skipped — using smart clip in Canvas')
  return null  // null = use original image with Canvas framing
}
