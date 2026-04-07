const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

export async function buildMarketingContent(merchantInfo) {
  if (!GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY');

  const { businessName, businessType, product, tone, targetAudience, cta } = merchantInfo;

  const systemPrompt = `You are a professional visual marketing director. Generate structured poster content in valid JSON.

STRICT RULES:
- Return ONLY valid JSON. No markdown, no backticks.
- scenePrompt: English only. Describe ONLY the background environment. 
- Must include a physical surface (e.g., marble, wood, studio floor) for the product to sit on.
- Describe cinematic lighting and depth of field.
- Leave the LEFT half of the image as empty negative space for text overlay.
- Describe the environment on the RIGHT side as empty, waiting for a product.
- NO text or logos inside the scenePrompt.
- headline/subtext/cta: Use Swahili or English based on merchant tone.

OUTPUT FORMAT:
{
  "scenePrompt": "detailed background description for image AI",
  "headline": "2-4 words",
  "subtext": "max 8 words",
  "cta": "2-3 words",
  "canvasSettings": {
    "primaryColor": "#HEX",
    "secondaryColor": "#HEX",
    "theme": "modern|luxury|vibrant"
  }
}`;

  const userMessage = `Create content for:
Business: ${businessName}
Type: ${businessType}
Product: ${product}
Tone: ${tone || 'premium'}
Audience: ${targetAudience || 'Tanzania'}
CTA: ${cta || 'Order Now'}`;

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.6,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq error: ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    parsed = {
      scenePrompt: `Professional ${businessType} background with cinematic lighting, premium studio surface, empty space on left, 8k resolution`,
      headline: "Quality Guaranteed",
      subtext: `Get the best ${product} from ${businessName}`,
      cta: "Order Now",
      canvasSettings: { primaryColor: "#25d078", secondaryColor: "#ffffff", theme: "modern" }
    };
  }

  return {
    scenePrompt: parsed.scenePrompt,
    headline: parsed.headline,
    subtext: parsed.subtext,
    cta: parsed.cta,
    canvasSettings: parsed.canvasSettings || { primaryColor: "#25d078", secondaryColor: "#ffffff", theme: "modern" }
  };
}