import { Router } from 'express';
import { buildPhotoshootPrompt } from './marketingAgent.js';
import { generatePhotoshoot } from './imageGen.js';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.post('/generate-poster', async (req, res) => {
  try {
    const { merchantId, businessType, product, style, productImageBase64 } = req.body;

    if (!productImageBase64) return res.status(400).json({ error: "Photo required" });

    // --- STEP 1: Upload to Supabase to get a Public URL ---
    // AI models need a URL to "see" your image
    const fileName = `temp/${merchantId}/${Date.now()}.jpg`;
    const buffer = Buffer.from(productImageBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    
    const { error: upError } = await sb.storage
      .from('merchant-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

    if (upError) throw upError;

    const { data: { publicUrl } } = sb.storage.from('merchant-images').getPublicUrl(fileName);

    // --- STEP 2: Get the Pro Prompt from Groq ---
    const aiPrompt = await buildPhotoshootPrompt({ businessType, product, style });

    // --- STEP 3: Generate high-end image using Flux-1 (via Pollinations) ---
    const finalImageUrl = await generatePhotoshoot(publicUrl, aiPrompt);

    res.json({
      success: true,
      data: {
        photoshootUrl: finalImageUrl,
        description: aiPrompt
      }
    });
  } catch (error) {
    console.error('Photoshoot Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;