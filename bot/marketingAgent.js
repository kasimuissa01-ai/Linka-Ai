const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function buildPhotoshootPrompt(merchantInfo) {
  const { businessType, product, style } = merchantInfo;

  const systemPrompt = `You are a world-class fashion photographer.
  
  Your job: Write a short, powerful visual description of a professional commercial photoshoot.
  
  STYLE GUIDE:
  - If style is "Luxury": Describe a high-end studio with marble floors and soft golden lighting.
  - If style is "Natural": Describe a sun-drenched outdoor garden or Balinese villa.
  - If style is "Bold": Describe a vibrant urban street in Dar es Salaam with neon lights.
  
  MANDATORY:
  - A professional African model is wearing/presenting the product.
  - Lighting must be "cinematic" and "commercial studio quality".
  - Mention "extremely detailed textures" and "high fashion magazine style".
  - DO NOT include any text or talking. Output only the description.`;

  const userMessage = `Product: ${product}. Business: ${businessType}. Style: ${style}.`;

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: 0.8,
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}