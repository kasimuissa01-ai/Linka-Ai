// imageGen.js - Production Optimized
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const FLUX_MODEL    = '@cf/black-forest-labs/flux-1-schnell';

/**
 * Note: Background removal is now handled on the Client-Side (Frontend) 
 * using @imgly/background-removal for better performance. 
 * This server-side function is kept as a lightweight fallback.
 */
export async function removeBackground(imageBase64) {
  // We keep this function to avoid breaking your existing imports, 
  // but in production, your frontend should send the already-cleaned PNG.
  // If the frontend fails, it hits this endpoint.
  const RMBG_API_URL = process.env.RMBG_API_URL || 'https://linkamarket-bg-remover.onrender.com';
  
  const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  if (!clean || clean.length < 100) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000); // 60s is enough

    const response = await fetch(`${RMBG_API_URL}/remove-bg-base64`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: clean }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!response.ok) return null;

    const data = await response.json();
    return data.image_base64 || data.imageBase64 || null;
  } catch (err) {
    console.error('[RMBG Fallback Failed]:', err.message);
    return null; 
  }
}

/**
 * Generates a high-end marketing background scene.
 * Automatically injects quality modifiers to ensure professional output.
 */
export async function generateScene(scenePrompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN)
    throw new Error('Missing CLOUDFLARE configuration');

  console.log('[FLUX] Preparing professional scene...');

  // PRODUCTION UPGRADE: The "Pro-Injection" string
  // This forces Flux to create backgrounds that look like luxury advertisements.
  const qualityModifiers = "professional product photography, cinematic lighting, ultra-detailed textures, soft bokeh background, 8k resolution, highly realistic, masterpiece, commercial studio setup";
  
  const enhancedPrompt = `${scenePrompt}, ${qualityModifiers}`;

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${FLUX_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        prompt: enhancedPrompt, 
        num_steps: 4,     // OPTIMIZED: Schnell is designed for 4 steps. Faster and sharper.
        guidance: 7.5     // Ensures the AI follows your prompt strictly.
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`FLUX API Error ${response.status}: ${err}`);
  }

  const json = await response.json();
  const b64 = json?.result?.image;
  
  if (!b64) throw new Error('Empty result from Flux');

  console.log('[FLUX] Professional scene generated successfully');
  return b64;
}

export async function generateMarketingImage(prompt) {
  return generateScene(prompt);
}