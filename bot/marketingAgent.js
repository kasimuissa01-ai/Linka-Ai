const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function buildPhotoshootPrompt(merchantInfo) {
  const { businessType, product, style } = merchantInfo;

  const systemPrompt = `You are a professional AI prompt engineer for high-end fashion and product photography.
  
  Your job: Create a 1-paragraph visual description for an AI to transform a basic photo into a luxury photoshoot.
  
  RULES:
  1. Describe a high-end environment (Studio, Luxury Villa, Paris Street, etc.)
  2. Describe a professional model wearing/holding the product.
  3. Describe cinematic lighting (Golden hour, soft studio softboxes).
  4. Mention "8k resolution", "highly detailed skin textures", "commercial photography".
  5. DO NOT mention text, logos, or posters.
  6. Output ONLY the paragraph. No JSON, no intro.`;

  const userMessage = `Product: ${product}. Business: ${businessType}. Style: ${style}.`;

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}