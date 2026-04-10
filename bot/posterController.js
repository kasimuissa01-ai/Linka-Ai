import { normalizeMerchant, STYLE_TO_TEMPLATE } from '../lib/normalize.js';
import { buildPhotoshootPrompt } from '../lib/marketingAgent.js';
import { renderPoster } from '../lib/posterRenderer.js';

// ─── Style → template fallback chain ─────────────────────────────────────────
function resolveTemplate(data) {
  // Primary: from normalizeMerchant
  if (STYLE_TO_TEMPLATE[data.style]) return STYLE_TO_TEMPLATE[data.style];
  // Ultimate fallback
  return 'kariakoo_bold';
}

// ─── Request validator ────────────────────────────────────────────────────────
function validateRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    errors.push('Request body must be JSON');
    return errors;
  }
  // At minimum need a product or bidhaa
  const hasProduct = body.product || body.bidhaa || body.item;
  if (!hasProduct) errors.push('Missing required field: product (or bidhaa)');

  return errors;
}

// ─── Main controller ──────────────────────────────────────────────────────────
export async function createPoster(req, res) {
  const startTime = Date.now();

  try {
    // 1. Validate
    const errors = validateRequest(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // 2. Normalize messy Swahili/mixed input
    const data = normalizeMerchant(req.body);
    console.log(`[posterController] Normalized data:`, {
      businessName: data.businessName,
      product: data.product,
      style: data.style,
      templateId: data.templateId,
      offerPhrase: data.offerPhrase,
      discount: data.discount
    });

    // 3. Resolve template
    const templateId = resolveTemplate(data);

    // 4. Build AI image prompt via Groq
    let prompt;
    try {
      prompt = await buildPhotoshootPrompt(data);
      console.log(`[posterController] Prompt built (${prompt.length} chars)`);
    } catch (err) {
      console.error('[posterController] Groq prompt failed, using fallback:', err.message);
      // Graceful fallback prompt — still safe to send to Pollinations
      prompt = `Professional commercial product photo of ${data.product}, ${data.style} style, Tanzanian setting, no text, no watermark, 8k quality, dramatic lighting, dark bottom third`;
    }

    // 5. Render poster
    const pngBuffer = await renderPoster({ prompt, templateId, data });

    const elapsed = Date.now() - startTime;
    console.log(`[posterController] Poster rendered in ${elapsed}ms`);

    // 6. Return PNG
    res
      .set('Content-Type', 'image/png')
      .set('X-Render-Ms', String(elapsed))
      .set('X-Template-Id', templateId)
      .send(pngBuffer);

  } catch (err) {
    console.error('[posterController] Fatal error:', err);
    res.status(500).json({
      success: false,
      error: 'Poster generation failed',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

// ─── Preview endpoint — returns JSON metadata, no image render ───────────────
export async function previewPosterMeta(req, res) {
  try {
    const errors = validateRequest(req.body);
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const data = normalizeMerchant(req.body);
    const templateId = resolveTemplate(data);

    let prompt;
    try {
      prompt = await buildPhotoshootPrompt(data);
    } catch {
      prompt = `[Groq unavailable] ${data.product}, ${data.style} style, no text`;
    }

    return res.json({
      success: true,
      data: {
        businessName: data.businessName,
        product: data.product,
        style: data.style,
        templateId,
        offerPhrase: data.offerPhrase,
        discount: data.discount,
        price: data.price,
        prompt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
