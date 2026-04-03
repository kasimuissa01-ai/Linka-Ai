const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL   = 'llama-3.1-8b-instant'

export async function buildMarketingPrompt(merchantInfo) {
  if (!GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY in environment')

  const { businessName, businessType, product, tone, targetAudience } = merchantInfo

  const systemPrompt = `You are a professional visual marketing director 
specializing in African e-commerce poster design for Instagram, Facebook, 
and WhatsApp Business.

Your job is to write a single detailed text-to-image prompt that generates 
a STUNNING, professional marketing poster.

Strict rules:
- Write ONLY the image prompt, nothing else
- No explanations, no labels, no intro text
- English only
- Make it look like a high-end commercial advertisement
- Include: lighting style, composition, color palette, mood, product details
- Style should feel premium and modern, suitable for Tanzanian market
- Do NOT include any written text or words inside the image
- Square 1024x1024 social media post format`

  const userMessage = `Create a marketing poster prompt for:
Business: ${businessName}
Type: ${businessType}
Product: ${product}
Tone: ${tone || 'professional and modern'}
Target Audience: ${targetAudience || 'general customers in Tanzania'}

Write the image generation prompt now:`

  const response = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages:    [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      temperature: 0.9,
      max_tokens:  400,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Groq error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return data.choices[0].message.content.trim()
}
