const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function buildPhotoshootPrompt(merchantInfo) {
  const { businessType, product, style, businessName } = merchantInfo;

  const systemPrompt = `You are a Senior Creative Director for a luxury African advertising agency.
Your job is to write a highly detailed English prompt for an AI Image Generator (Flux-1) to create a FINISHED social media marketing poster.

STRICT DESIGN RULES:
1. THEME: Use high-end commercial photography lighting.
2. TEXT RENDERING: You must instruct the AI to include specific SWAHILI text. Swahili text is more relatable for Tanzanian SMEs.
3. COMPOSITION: Describe a square 1:1 layout. The product should be central and heroic.
4. MODEL: Use professional, attractive African models that represent the target merchant's audience.
5. NO HALLUCINATION: Ensure the description of the product stays true to: ${product}.

LOCALIZATION (SWAHILI FOCUS):
- Use phrases like "OFA KABAMBE" (Great Offer), "PUNGUZO" (Discount), "MZIGO MPYA" (New Arrival), or "BEI POA" (Good Price).
- Always include the Business Name: "${businessName}" at the top or bottom as a logo/text.

STYLE GUIDE:
- Luxury: High-fashion studio, gold/black accents, soft bokeh.
- Natural: Outdoor tropical sunlight, Balinese or Swahili coastal vibes, organic textures.
- Bold: Vibrant "Kariakoo" street style, neon lights, high energy.

OUTPUT: Only the visual prompt paragraph. No conversational filler.`;

  const userMessage = `Create a professional poster for:
  Business: ${businessName} (${businessType}). 
  Product: ${product}. 
  Style: ${style}. 
  Swahili Phrase to include: Choose the most fitting one (e.g., MZIGO MPYA or OFA KABAMBE).`;

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}