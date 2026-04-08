const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;

// Stable Diffusion XL for Image-to-Image
const MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

export async function generatePhotoshoot(imageBase64, photoshootPrompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error('Missing Cloudflare Credentials');

  console.log('[AI Photoshoot] Preparing data for Cloudflare...');

  // 1. Clean the base64 string
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  
  // 2. Convert Base64 to a standard Node.js Buffer
  const buffer = Buffer.from(cleanBase64, 'base64');
  
  // 3. Convert Buffer to an Array of Numbers
  // Cloudflare's JSON API requires the image pixels as a simple array [12, 255, 30...]
  const imageArray = Array.from(new Uint8Array(buffer));

  // 4. Create the JSON Payload
  const payload = {
    prompt: photoshootPrompt,
    image: imageArray,     // The image data as a number array
    strength: 0.5,         // How much to change the image (0.1 = tiny change, 0.9 = total change)
    num_steps: 20,         // Quality level
    guidance: 7.5
  };

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json" // Crucial: This tells Cloudflare to expect JSON
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[Cloudflare Error Details]:', JSON.stringify(data));
      throw new Error(data.errors?.[0]?.message || 'Cloudflare AI failed');
    }

    // Cloudflare returns the image as a Base64 string in the "result.image" field
    return data.result.image;

  } catch (err) {
    console.error('[imageGen] Fetch Error:', err.message);
    throw err;
  }
}