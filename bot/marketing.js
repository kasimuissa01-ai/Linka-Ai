import { Router } from 'express';
import { buildPhotoshootPrompt } from './marketingAgent.js';
import { generatePhotoshoot } from './imageGen.js';

const router = Router();

router.post('/generate-poster', async (req, res) => {
  try {
    const { merchantId, businessType, product, style, productImageBase64 } = req.body;

    if (!productImageBase64) return res.status(400).json({ error: "Photo required" });

    // 1. Ask Groq to design the photoshoot scene
    const aiPrompt = await buildPhotoshootPrompt({ businessType, product, style });

    // 2. Ask Cloudflare to transform the image
    const resultB64 = await generatePhotoshoot(productImageBase64, aiPrompt);

    res.json({
      success: true,
      data: {
        photoshootUrl: `data:image/png;base64,${resultB64}`,
        description: aiPrompt
      }
    });
  } catch (error) {
    console.error('Photoshoot Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;