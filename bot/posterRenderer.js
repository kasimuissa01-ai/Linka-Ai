import sharp from 'sharp';
import fetch from 'node-fetch';
import { TEMPLATES, FONT_REGISTRY } from '../templates/index.js';

// ─── Font cache: loaded once, stored as base64 ───────────────────────────────
const fontCache = new Map();

async function loadFont(url, family, weight) {
  const key = `${family}-${weight}`;
  if (fontCache.has(key)) return fontCache.get(key);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
    const buf = await res.buffer();
    const b64 = buf.toString('base64');
    fontCache.set(key, b64);
    return b64;
  } catch (err) {
    console.warn(`[posterRenderer] Could not load font ${key}:`, err.message);
    return null;
  }
}

export async function preloadFonts() {
  console.log('[posterRenderer] Preloading fonts...');
  await Promise.all(
    FONT_REGISTRY.map(f => loadFont(f.url, f.family, f.weight))
  );
  console.log(`[posterRenderer] ${fontCache.size} font variants cached.`);
}

// ─── SVG @font-face block ────────────────────────────────────────────────────
function buildFontFaceCSS() {
  let css = '';
  for (const { family, weight, url } of FONT_REGISTRY) {
    const key = `${family}-${weight}`;
    const b64 = fontCache.get(key);
    if (b64) {
      css += `@font-face {
        font-family: '${family}';
        font-weight: ${weight};
        src: url('data:font/woff2;base64,${b64}') format('woff2');
      }\n`;
    }
  }
  return css;
}

// ─── Template variable interpolation ─────────────────────────────────────────
function interpolate(str, data) {
  if (!str) return '';
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    return val !== undefined && val !== null ? val : '';
  });
}

// ─── Condition checker ────────────────────────────────────────────────────────
function shouldRenderLayer(layer, data) {
  if (!layer.condition) return true;
  const val = data[layer.condition];
  const interpolated = interpolate(layer.text, data);
  // Skip if condition key is missing/null OR interpolated text is empty
  return val && interpolated.trim() !== '';
}

// ─── Escape XML special chars ─────────────────────────────────────────────────
function escapeXML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── SVG overlay builder ──────────────────────────────────────────────────────
function buildSVG(template, data) {
  const { canvas, overlays = [], layers = [] } = template;
  const fontCSS = buildFontFaceCSS();

  let svg = `<svg width="${canvas.w}" height="${canvas.h}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;

  // Embed fonts
  svg += `<defs><style>${fontCSS}</style>`;

  // Define gradients
  let gradientIndex = 0;
  const gradientIds = [];
  for (const ov of overlays) {
    if (ov.type === 'gradient') {
      const id = `grad${gradientIndex++}`;
      gradientIds.push(id);
      const g = ov.gradient;
      if (g.type === 'linear') {
        const angle = g.angle || 180;
        const rad = (angle * Math.PI) / 180;
        const x2 = 50 + 50 * Math.sin(rad);
        const y2 = 50 + 50 * Math.cos(rad);
        svg += `<linearGradient id="${id}" x1="50%" y1="${100-y2}%" x2="${x2}%" y2="${y2}%">
          <stop offset="0%" stop-color="${g.from}"/>
          <stop offset="100%" stop-color="${g.to}"/>
        </linearGradient>`;
      }
    } else {
      gradientIds.push(null);
    }
  }

  svg += `</defs>`;

  // Render overlays
  let gIdx = 0;
  for (const ov of overlays) {
    switch (ov.type) {
      case 'gradient': {
        const gid = gradientIds[gIdx];
        svg += `<rect x="${ov.x}" y="${ov.y}" width="${ov.w}" height="${ov.h}" fill="url(#${gid})"/>`;
        break;
      }
      case 'rect':
        svg += `<rect x="${ov.x}" y="${ov.y}" width="${ov.w}" height="${ov.h}" fill="${ov.fill}"/>`;
        break;
      case 'rounded-rect':
        svg += `<rect x="${ov.x}" y="${ov.y}" width="${ov.w}" height="${ov.h}" fill="${ov.fill}" rx="${ov.rx || 0}"/>`;
        break;
    }
    gIdx++;
  }

  // Render layers
  for (const layer of layers) {
    if (!shouldRenderLayer(layer, data)) continue;
    const text = escapeXML(interpolate(layer.text || '', data));

    const fontWeight = layer.weight || '700';
    const fontStyle = layer.italic ? 'italic' : 'normal';
    const letterSpacing = layer.letterSpacing ? `letter-spacing="${layer.letterSpacing}"` : '';
    const shadowFilter = layer.shadow
      ? `filter="drop-shadow(0px 3px 10px rgba(0,0,0,0.7))"`
      : '';
    const textTransform = layer.uppercase ? text.toUpperCase() : text;

    switch (layer.type) {
      case 'headline':
      case 'sub':
      case 'business':
      case 'price':
        svg += `<text
          x="${layer.x}" y="${layer.y}"
          font-family="'${layer.font}', sans-serif"
          font-size="${layer.size}"
          font-weight="${fontWeight}"
          font-style="${fontStyle}"
          fill="${layer.color}"
          text-anchor="${layer.anchor || 'middle'}"
          ${letterSpacing}
          ${shadowFilter}
        >${textTransform}</text>`;
        break;

      case 'divider':
        svg += `<rect x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" fill="${layer.fill}"/>`;
        break;

      case 'badge': {
        const badgeText = escapeXML(interpolate(layer.text, data).toUpperCase());
        // Multi-line badge support: split on newline
        svg += `<circle cx="${layer.cx}" cy="${layer.cy}" r="${layer.r}" fill="${layer.bg}"/>`;
        svg += `<text
          x="${layer.cx}" y="${layer.cy + layer.size * 0.35}"
          font-family="'${layer.font || 'Anton'}', sans-serif"
          font-size="${layer.size}"
          font-weight="700"
          fill="${layer.color}"
          text-anchor="middle"
        >${badgeText}</text>`;
        break;
      }
    }
  }

  svg += `</svg>`;
  return Buffer.from(svg, 'utf8');
}

// ─── Image fetcher with retry ─────────────────────────────────────────────────
async function fetchImageWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { timeout: 30000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.buffer();
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`[posterRenderer] Image fetch retry ${i + 1}...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ─── Main render function ─────────────────────────────────────────────────────
export async function renderPoster({ prompt, templateId, data }) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`Unknown template: ${templateId}`);

  const { w, h } = template.canvas;

  // Build Pollinations URL — gptimage model for best quality
  const negativePrompt = encodeURIComponent('text, letters, words, watermark, logo, sign, banner, typography');
  const encodedPrompt = encodeURIComponent(prompt);
  const imgUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=gptimage&width=${w}&height=${h}&nologo=true&negative=${negativePrompt}&seed=${Date.now()}`;

  console.log(`[posterRenderer] Fetching AI image for template: ${templateId}`);

  let baseBuffer;
  try {
    baseBuffer = await fetchImageWithRetry(imgUrl);
  } catch (err) {
    console.error('[posterRenderer] Image fetch failed:', err.message);
    // Fallback: generate a solid dark background
    baseBuffer = await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } }
    }).png().toBuffer();
  }

  // Build SVG overlay
  const svgOverlay = buildSVG(template, data);

  // Composite: base image + SVG overlay
  const result = await sharp(baseBuffer)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png({ compressionLevel: 8, quality: 95 })
    .toBuffer();

  console.log(`[posterRenderer] Render complete. Output size: ${(result.length / 1024).toFixed(1)} KB`);
  return result;
}
