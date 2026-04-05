// marketingAgent.js
// Groq generates structured JSON:
// { scenePrompt, headline, subtext, cta }

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL   = 'llama-3.1-8b-instant'

/**
 * Generates structured poster content in one Groq call.
 * Returns: { scenePrompt, headline, subtext, cta }
 *
 * scenePrompt → used by Cloudflare FLUX to generate background scene
 * headline    → big bold text on poster (2-4 words)
 * subtext     → supporting line (max 8 words)
 * cta         → call to action (2-3 words)
 */
export async function buildMarketingContent(merchantInfo) {
  if (!GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY in environment')

  const { businessName, businessType, product, tone, targetAudience, cta } = merchantInfo

  const systemPrompt = `You are a professional visual marketing director specializing in high-converting e-commerce product posters for African brands.

Your job is to generate structured poster content in ONE response.

STRICT RULES:
- Return ONLY valid JSON, no extra text, no markdown, no backticks
- English only for scenePrompt (image model requires English)
- Swahili or English for headline/subtext/cta based on tone
- NO text or words inside the scenePrompt (image model will render them badly)

SCENE PROMPT REQUIREMENTS:
- Describe ONLY the background environment, NOT the product
- Leave clear NEGATIVE SPACE on the LEFT side for text overlay
- Product focus area on the RIGHT side (empty, waiting for product)
- Premium commercial photography style
- Strong cinematic or soft natural lighting
- Clean color palette (2-3 dominant colors max)
- Realistic shadows and depth
- NO people, NO text, NO logos in scene
- Instagram-ready 1:1 square composition

COPY REQUIREMENTS:
- headline: 2-4 words maximum, bold emotional impact
- subtext: 1 line, maximum 8 words, supports the headline
- cta: 2-3 words action phrase

OUTPUT FORMAT (return exactly this JSON structure):
{
  "scenePrompt": "...",
  "headline": "...",
  "subtext": "...",
  "cta": "..."
}`

  const userMessage = `Create poster content for:

Business Name: ${businessName}
Business Type: ${businessType}
Product: ${product}
Tone: ${tone || 'modern, clean, aspirational'}
Target Audience: ${targetAudience || 'young urban customers in Tanzania'}
Desired CTA: ${cta || 'Order Now'}

The background scene should perfectly complement this product's style and make it stand out when the product image is placed on the right side.

Return the JSON now:`

  const response = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      temperature: 0.6,   // controlled for consistency
      max_tokens:  500,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Groq error ${response.status}: ${err}`)
  }

  const data    = await response.json()
  const rawText = data.choices[0].message.content.trim()

  // Parse JSON — strip any accidental backticks or markdown
  const clean = rawText.replace(/```json|```/g, '').trim()

  let parsed
  try {
    parsed = JSON.parse(clean)
  } catch (e) {
    console.error('[MarketingAgent] Groq JSON parse failed:', rawText)
    // Fallback defaults so the pipeline never breaks
    parsed = {
      scenePrompt: `Premium ${businessType} product advertisement background, warm studio lighting, clean minimal setup, soft shadows, empty space left side, product spotlight right side, professional commercial photography style`,
      headline:    businessName || 'Premium Quality',
      subtext:     `${product} - Order via WhatsApp`,
      cta:         cta || 'Order Now',
    }
  }

  // Validate all fields exist
  return {
    scenePrompt: parsed.scenePrompt || `Clean product advertisement background for ${product}`,
    headline:    parsed.headline    || businessName,
    subtext:     parsed.subtext     || product,
    cta:         parsed.cta         || 'Order Now',
  }
}
