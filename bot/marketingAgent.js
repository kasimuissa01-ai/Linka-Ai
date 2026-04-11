const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Style → studio photography brief ─────────────────────────────────────────
// All styles use CLEAN STUDIO. No markets, no streets, no busy backgrounds.
const STYLE_BRIEFS = {
  bold:    'clean light grey studio background, bright directional lighting, product hero shot, flat lay or standing product, e-commerce style',
  luxury:  'soft beige or blush pink studio background, elegant mood lighting, luxury fashion editorial, minimal props, aspirational',
  natural: 'warm white studio, soft natural daylight from window, clean shadows, organic linen or wood surface, lifestyle product',
  minimal: 'pure white seamless background, soft box lighting, no shadows, clean Scandinavian product photography, lots of empty space',
  festive: 'warm coral or vibrant solid color studio backdrop, bright even lighting, cheerful product display, celebration mood'
};

// ── Product visual hints ──────────────────────────────────────────────────────
const PRODUCT_VISUAL_HINTS = {
  dress:     'garment on a clean mannequin or flat lay on white surface, fabric texture visible',
  kitenge:   'folded or displayed kitenge fabric, bold wax print detail close-up, flat lay',
  shoes:     'single shoe or pair on white pedestal or floating, dramatic side lighting, sharp detail',
  phone:     'smartphone standing upright on minimal white surface, screen facing forward, clean tech shot',
  food:      'overhead flat lay, fresh ingredients, steam rising, white ceramic plate, natural light',
  jewelry:   'close-up macro on velvet surface, sparkle and reflections, clean background',
  cosmetics: 'beauty products arranged neatly, pastel surface, soft light, dewy textures',
  bag:       'handbag standing upright on white surface, structured shape, clean studio',
  watch:     'wristwatch on white or dark pedestal, dramatic macro lighting, sharp detail',
  default:   'product centred on clean studio surface, professional e-commerce lighting, sharp focus'
};

function getProductHint(product) {
  const p = product.toLowerCase();
  for (const [key, hint] of Object.entries(PRODUCT_VISUAL_HINTS)) {
    if (p.includes(key)) return hint;
  }
  return PRODUCT_VISUAL_HINTS.default;
}

export async function buildPhotoshootPrompt(merchantInfo) {
  const { product, style } = merchantInfo;
  const styleBrief = STYLE_BRIEFS[style] || STYLE_BRIEFS.bold;
  const productHint = getProductHint(product);

  const systemPrompt = `You are a product photography director for a Tanzanian e-commerce brand.
Write ONE concise visual prompt (max 70 words) for an AI image generator.

ABSOLUTE RULES:
1. NO text, letters, words, numbers, logos, watermarks anywhere in the image.
2. STUDIO ONLY — no markets, no streets, no busy outdoor scenes.
3. Clean simple background — white, grey, beige, or solid color only.
4. Product must be clearly visible and sharp — this is an e-commerce photo.
5. Top 70% of frame: product. Bottom 30%: clean simple background with no clutter — text will be added here.
6. Output ONLY the visual description. No quotes, no explanation.`;

  const userMessage = `Product: ${product}
Studio style: ${styleBrief}
Composition tip: ${productHint}`;

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
      temperature: 0.2,
      max_tokens: 120
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const rawPrompt = data.choices?.[0]?.message?.content?.trim();
  if (!rawPrompt) throw new Error('Empty prompt from Groq');

  return `${rawPrompt}, no text, no watermark, studio photography, white background, photorealistic`;
}
