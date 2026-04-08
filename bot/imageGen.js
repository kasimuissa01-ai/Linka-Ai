const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;

// We use SDXL for Image-to-Image transformation
const MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

export async function generatePhotoshoot(imageBase64, photoshootPrompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error('Missing Cloudflare Credentials');

  console.log('[AI Photoshoot] Transforming image...');

  // Convert Base64 to Uint8Array for Cloudflare API
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(cleanBase64);
  const imageArray = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    imageArray[i] = binaryString.charCodeAt(i);
  }

  // We use FormData to send binary data to Cloudflare
  const formData = new FormData();
  formData.append("image", new Blob([imageArray], { type: "image/jpeg" }));
  formData.append("prompt", photoshootPrompt);
  formData.append("num_steps", "20");
  formData.append("strength", "0.5"); // 0.5 keeps the dress shape but changes the person/room
  formData.append("guidance", "7.5");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${CF_API_TOKEN}` },
      body: formData,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Cloudflare AI Error: ${err}`);
  }

  // Cloudflare returns the image as a binary stream
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}