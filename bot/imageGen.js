const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN
const FLUX_MODEL    = '@cf/black-forest-labs/flux-1-schnell'
const RMBG_MODEL    = '@cf/bria-ai/rmbg-1.4'

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

// ─────────────────────────────────────────────────────────────
// removeBackground
//
// FIX #2: Cloudflare BRIA rmbg-1.4 expects:
//   { image: number[] }  ← array of raw uint8 pixel values
// NOT:
//   { image: "base64string" }  ← this was the bug
//
// We convert: base64 string → Buffer → Array of numbers
// BRIA returns raw PNG bytes (arrayBuffer) → we convert to base64
// ─────────────────────────────────────────────────────────────
export async function removeBackground(imageBase64) {
  checkEnv()
  console.log('[ImageGen] Removing background with Cloudflare BRIA...')

  // ✅ Convert base64 → Buffer → plain number array (what BRIA expects)
  const imageBuffer = Buffer.from(imageBase64, 'base64')
  const imageArray  = Array.from(imageBuffer)   // [ 137, 80, 78, 71, ... ]

  const response = await fetch(cfUrl(RMBG_MODEL), {
    method:  'POST',
    headers: cfHeaders(),
    body:    JSON.stringify({ image: imageArray }),  // ✅ array of uint8, not base64 string
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Background removal error ${response.status}: ${err}`)
  }

  // ✅ BRIA returns raw PNG bytes — read as arrayBuffer then convert to base64
  const buffer      = await response.arrayBuffer()
  const base64Image = Buffer.from(buffer).toString('base64')

  if (!base64Image || base64Image.length < 100) {
    throw new Error('Background removal returned empty or invalid response')
  }

  console.log('[ImageGen] Background removed successfully')
  return base64Image  // raw base64 PNG with transparent background
}

// ─────────────────────────────────────────────────────────────
// generateScene
//
// FLUX returns JSON: { result: { image: "base64string" } }
// This was already correct — no changes needed here.
// ─────────────────────────────────────────────────────────────
export async function generateScene(scenePrompt) {
  checkEnv()
  console.log('[ImageGen] Generating scene with Cloudflare FLUX...')

  const response = await fetch(cfUrl(FLUX_MODEL), {
    method:  'POST',
    headers: cfHeaders(),
    body:    JSON.stringify({ prompt: scenePrompt, num_steps: 8 }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Scene generation error ${response.status}: ${err}`)
  }

  // ✅ FLUX returns JSON — read as json()
  const json        = await response.json()
  const base64Scene = json?.result?.image

  if (!base64Scene) {
    throw new Error(`No scene image in Cloudflare response: ${JSON.stringify(json)}`)
  }

  console.log('[ImageGen] Scene generated successfully')
  return base64Scene  // raw base64 string (no data URL prefix)
}

// Legacy export kept for backward compatibility
export async function generateMarketingImage(prompt) {
  return generateScene(prompt)
}
