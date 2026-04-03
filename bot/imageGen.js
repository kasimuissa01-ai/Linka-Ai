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

  const imageBuffer = await response.arrayBuffer()
  const base64Image = Buffer.from(imageBuffer).toString('base64')
  return base64Image
}
