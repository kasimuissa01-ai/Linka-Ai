const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const STYLE_BRIEFS = {
  bold: 'vibrant Kariakoo street market energy, saturated colors, dynamic lighting, urban Dar es Salaam backdrop',
  luxury: 'high-fashion editorial, soft bokeh, gold and black studio, moody directional lighting, aspirational affluence',
  natural: 'golden hour Swahili coast, warm tropical light, organic textures, turquoise Indian Ocean backdrop',
  minimal: 'clean white studio, soft shadows, contemporary Scandinavian minimalism, pure negative space',
  festive: 'celebration mood, confetti, warm festive lighting, joyful African setting'
};

const PRODUCT_VISUAL_HINTS = {
  dress: 'flowing fabric catching light, elegant drape',
  kitenge: 'bold wax print patterns, vivid fabric detail close-up',
  shoes: 'glamour shot on reflective surface, dramatic side lighting',
  phone: 'product on minimal surface, clean tech aesthetic',
  food: 'steam rising, fresh ingredients surrounding, overhead flat lay',
  jewelry: 'macro close-up, sparkle and reflection, velvet background',
  cosmetics: 'dewy texture, pastel surface, beauty editorial',
  default: 'hero product centred, commercial studio quality'
};

function getProductHint(product) {
  const p = product.toLowerCase();
  for (const [key, hint] of Object.entries(PRODUCT_VISUAL_HINTS)) {
    if (p.includes(key)) return hint;
  }
  return PRODUCT_VISUAL_HINTS.default;
}

export async function buildPhotoshootPrompt(merchantInfo) {
  const { product, style } = merchantInfo; // ✅ businessName intentionally excluded — prevents text hallucination
  const styleBrief = STYLE_BRIEFS[style] || STYLE_BRIEFS.bold;
  const productHint = getProductHint(product);

  const systemPrompt = `You are a Creative Director at a Tanzanian advertising agency.
Write ONE concise visual prompt (max 70 words) for an AI image generator.

ABSOLUTE RULES:
1. NO text, letters, words, numbers, logos, watermarks, or signage anywhere.
2. NO artificial boxes, banners, or graphic elements. Real photo only.
3. Composition: Place main subject in top 70 percent of frame. Leave bottom 30 percent as clean, uncluttered negative space with simple background.
4. Product accuracy: ${product}. Tanzanian setting. Professional African models if people shown.
5. Output ONLY the visual description. No quotes, no explanation.`;

  const userMessage = `Product: ${product}
Style: ${styleBrief}
Tip: ${productHint}`;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,   // ✅ tight — prevents creative drift and hallucinated text
      max_tokens: 120     // ✅ short enough to stay on brief
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const rawPrompt = data.choices?.[0]?.message?.content?.trim();

  if (!rawPrompt) throw new Error('Empty prompt from Groq');

  // Append hard negatives — short, no redundancy with system prompt
  return `${rawPrompt}, no text, no watermark, photorealistic`;
}
