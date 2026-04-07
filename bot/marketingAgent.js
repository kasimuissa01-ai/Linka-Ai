const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

/**
 * Generates structured poster content via Groq Llama-3.
 * Returns: { scenePrompt, headline, subtext, cta, canvasSettings }
 */
export async function buildMarketingContent(merchantInfo) {
  if (!GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY in environment');

  const { businessName, businessType, product, tone, targetAudience, cta } = merchantInfo;

  const systemPrompt = `You are a professional visual marketing director specializing in premium e-commerce posters.

YOUR GOAL:
Generate structured poster content in valid JSON for a high-end marketing ad.

STRICT RULES:
1. Return ONLY valid JSON. No backticks, no markdown.
2. scenePrompt: English only. Describe ONLY the background environment.
3. PHYSICAL SURFACE: You MUST include a physical surface (e.g., "polished wooden table", "marble countertop", "studio floor", "stone pedestal"). This is vital to prevent products from floating.
4. NEGATIVE SPACE: Describe the LEFT side as empty for text. Describe the RIGHT side as the area where the product will sit.
5. LIGHTING: Describe cinematic lighting (e.g., "warm morning sunlight hitting the surface", "soft studio lighting with deep shadows").
6. STYLE: Photography style only. No text or logos in the scenePrompt.
7. COPY: Use Swahili or English for headline/subtext/cta based on the business context.

OUTPUT FORMAT:
{
  "scenePrompt": "detailed background description for image AI",
  "headline": "2-4 words maximum",
  "subtext": "1 line, max 8 words",
  "cta": "2-3 words action phrase",
  "canvasSettings": {
    "primaryColor": "#HEXCODE",
    "accentColor": "#HEXCODE",
    "theme": "luxury|vibrant|clean"
  }
}`;

  const userMessage = `Create poster content for:
Business Name: ${businessName}
Business Type: ${businessType}
Product: ${product}
Tone: ${tone || 'modern and premium'}
Target Audience: ${targetAudience || 'Tanzania'}
Desired CTA: ${cta || 'Order Now'}`;

  try {
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
        response_format: { type: "json_object" } // Ensures valid JSON
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq error: ${err}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return {
      scenePrompt: parsed.scenePrompt,
      headline: parsed.headline,
      subtext: parsed.subtext,
      cta: parsed.cta,
      canvasSettings: parsed.canvasSettings || { primaryColor: "#25d078", accentColor: "#ffffff", theme: "clean" }
    };

  } catch (e) {
    console.error('[MarketingAgent] Error:', e.message);
    // Professional Fallback so the app never crashes
    return {
      scenePrompt: `Professional ${businessType} photography background, luxury studio surface, cinematic lighting, empty space on left, 8k resolution`,
      headline: businessName || "Premium Quality",
      subtext: `Get the best ${product} today`,
      cta: cta || "Order Now",
      canvasSettings: { primaryColor: "#25d078", accentColor: "#ffffff", theme: "clean" }
    };
  }
}