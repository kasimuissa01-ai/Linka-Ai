const CF_ACCOUNT_ID   = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN    = process.env.CLOUDFLARE_API_TOKEN
const FLUX_MODEL      = '@cf/black-forest-labs/flux-1-schnell'
const RMBG_MODEL      = '@cf/bria-ai/rmbg-1.4'

function cfUrl(model) {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`
}

function cfHeaders() {
  return {
    'Authorization': `Bearer ${CF_API_TOKEN}`,
    'Content-Type':  'application/json',
  }
}

function checkEnv() {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN')
  }
}

export async function removeBackground(imageBase64) {
  checkEnv()

  console.log('[ImageGen] Removing background with Cloudflare BRIA...')

  const response = await fetch(cfUrl(RMBG_MODEL), {
    method:  'POST',
    headers: cfHeaders(),
    body:    JSON.stringify({ image: imageBase64 }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Background removal error ${response.status}: ${err}`)
  }

  const json = await response.json()

  // BRIA returns the image in result.image as base64
  const result = json?.result?.image || json?.result

  if (!result) {
    console.error('[ImageGen] BRIA response:', JSON.stringify(json))
    throw new Error('Background removal returned no image')
  }

  console.log('[ImageGen] Background removed successfully')
  return result // base64 PNG with transparent background
}

// ─────────────────────────────────────────────────────────────
// FUNCTION 2: Generate background scene (no product)
// Input:  scene prompt from Groq
// Output: base64 string of scene image
// ─────────────────────────────────────────────────────────────
export async function generateScene(scenePrompt) {
  checkEnv()

  console.log('[ImageGen] Generating scene with Cloudflare FLUX...')

  const response = await fetch(cfUrl(FLUX_MODEL), {
    method:  'POST',
    headers: cfHeaders(),
    body:    JSON.stringify({
      prompt:    scenePrompt,
      num_steps: 8,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Scene generation error ${response.status}: ${err}`)
  }

  const json        = await response.json()
  const base64Scene = json?.result?.image

  if (!base64Scene) {
    throw new Error(`No scene image in response: ${JSON.stringify(json)}`)
  }

  console.log('[ImageGen] Scene generated successfully')
  return base64Scene // base64 PNG of the background scene
}

// ─────────────────────────────────────────────────────────────
// FUNCTION 3: Legacy full image generation (kept for compatibility)
// ─────────────────────────────────────────────────────────────
export async function generateMarketingImage(prompt) {
  return generateScene(prompt)
}
