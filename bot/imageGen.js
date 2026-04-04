const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN
const MODEL         = '@cf/black-forest-labs/flux-1-schnell'

export async function generateMarketingImage(prompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN')
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      prompt,
      num_steps: 8,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Cloudflare error ${response.status}: ${err}`)
  }

  // ✅ CORRECT: Cloudflare FLUX returns JSON with base64 image inside
  // response.result.image is already a base64 string — do NOT convert again
  const json = await response.json()

  // Extract the base64 image string
  const base64Image = json?.result?.image

  if (!base64Image) {
    throw new Error(`Cloudflare returned no image. Response: ${JSON.stringify(json)}`)
  }

  return base64Image // already clean base64, ready to upload
}
