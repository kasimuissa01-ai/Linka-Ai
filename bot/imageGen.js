const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const FLUX_MODEL    = '@cf/black-forest-labs/flux-1-schnell';

export async function generateScene(scenePrompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error('Missing Cloudflare Credentials');

  // Automatically add high-end photography keywords
  const proPrompt = `${scenePrompt}, professional product photography, cinematic lighting, 8k, bokeh, high resolution`;

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${FLUX_MODEL}`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt: proPrompt, 
        num_steps: 4 // Optimized for Schnell speed
      }),
    }
  );

  const json = await response.json();
  return json?.result?.image || null;
}