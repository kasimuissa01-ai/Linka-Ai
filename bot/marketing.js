import { Router } from 'express';
import { buildPhotoshootPrompt } from './marketingAgent.js';
import { generatePhotoshoot } from './imageGen.js';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.post('/generate-poster', async (req, res) => {
  try {
    const { merchantId, businessName, businessType, product, style, productImageBase64 } = req.body;

    let publicUrl = null;

    // Optional: If merchant provided a photo, upload it so AI can use it as a 'Style/Product Reference'
    if (productImageBase64 && productImageBase64.length > 500) {
      const fileName = `refs/${merchantId}/${Date.now()}.jpg`;
      const buffer = Buffer.from(productImageBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
      
      const { error: upError } = await sb.storage
        .from('merchant-images')
        .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

      if (!upError) {
        const { data } = sb.storage.from('merchant-images').getPublicUrl(fileName);
        publicUrl = data.publicUrl;
      }
    }

    // 1. Creative Director writes the Ad Prompt
    const aiPrompt = await buildPhotoshootPrompt({ businessName, businessType, product, style });

    // 2. Flux-1 Engine renders the Poster with Swahili text
    const finalPosterUrl = await generatePhotoshoot(publicUrl, aiPrompt);

    res.json({
      success: true,
      data: {
        photoshootUrl: finalPosterUrl, // This is the direct link to the 1080x1080 poster
        description: aiPrompt
      }
    });
  } catch (error) {
    console.error('[Marketing Route Error]:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create poster.' });
  }
});

export default router;