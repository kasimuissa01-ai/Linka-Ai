/**
 * LinkaMarket Poster Templates
 * Canvas: 1080×1350 (4:5 Instagram Portrait)
 *
 * Layer types:
 *   headline   — large display text
 *   sub        — supporting text line
 *   business   — business name (always bottom)
 *   badge      — circular badge (NEW, SALE, etc.)
 *   price      — price display block
 *   divider    — horizontal rule
 *
 * Template variables (replaced at render):
 *   {{offerPhrase}}   — e.g. OFA KABAMBE
 *   {{businessName}}  — merchant name
 *   {{discount}}      — numeric, e.g. 50
 *   {{price}}         — formatted, e.g. TZS 25,000
 *   {{tagline}}       — optional short phrase
 */

export const TEMPLATES = {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. KARIAKOO BOLD — street energy, high contrast, vibrant
  // ──────────────────────────────────────────────────────────────────────────
  kariakoo_bold: {
    name: 'Kariakoo Bold',
    canvas: { w: 1080, h: 1350 },
    background: null, // uses AI image

    overlays: [
      // Full-bottom gradient scrim
      {
        type: 'gradient',
        x: 0, y: 600, w: 1080, h: 750,
        gradient: { type: 'linear', from: 'rgba(0,0,0,0)', to: 'rgba(0,0,0,0.88)', angle: 180 }
      },
      // Accent stripe
      {
        type: 'rect',
        x: 0, y: 1260, w: 1080, h: 8,
        fill: '#FF3B30'
      }
    ],

    layers: [
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 540, y: 960,
        size: 178,
        font: 'Anton',
        color: '#FFFFFF',
        anchor: 'middle',
        letterSpacing: 4
      },
      {
        type: 'sub',
        text: 'Punguzo hadi {{discount}}%',
        x: 540, y: 1050,
        size: 62,
        font: 'Poppins',
        weight: '700',
        color: '#FF3B30',
        anchor: 'middle'
      },
      {
        type: 'divider',
        x: 340, y: 1090,
        w: 400, h: 3,
        fill: 'rgba(255,255,255,0.4)'
      },
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1170,
        size: 52,
        font: 'Poppins',
        weight: '600',
        color: '#FFD700',
        anchor: 'middle',
        condition: 'price' // only render if {{price}} exists
      },
      {
        type: 'business',
        text: '{{businessName}}',
        x: 540, y: 1310,
        size: 38,
        font: 'Poppins',
        weight: '400',
        color: 'rgba(255,255,255,0.85)',
        anchor: 'middle',
        uppercase: true,
        letterSpacing: 6
      }
    ]
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 2. LUXURY GOLD — fashion-forward, aspirational, dark elegance
  // ──────────────────────────────────────────────────────────────────────────
  luxury_gold: {
    name: 'Luxury Gold',
    canvas: { w: 1080, h: 1350 },
    background: null,

    overlays: [
      // Bottom dark panel
      {
        type: 'rect',
        x: 0, y: 880, w: 1080, h: 470,
        fill: 'rgba(8,6,6,0.82)'
      },
      // Gold top line accent on panel
      {
        type: 'rect',
        x: 80, y: 880, w: 920, h: 2,
        fill: '#D4AF37'
      },
      // Gold bottom line accent
      {
        type: 'rect',
        x: 80, y: 1348, w: 920, h: 2,
        fill: '#D4AF37'
      }
    ],

    layers: [
      // Top corner wordmark
      {
        type: 'business',
        text: '{{businessName}}',
        x: 80, y: 80,
        size: 32,
        font: 'Montserrat',
        weight: '700',
        color: '#D4AF37',
        anchor: 'start',
        uppercase: true,
        letterSpacing: 8
      },
      // Decorative em dash above headline
      {
        type: 'sub',
        text: '— — —',
        x: 540, y: 970,
        size: 28,
        font: 'Montserrat',
        weight: '300',
        color: '#D4AF37',
        anchor: 'middle',
        letterSpacing: 12
      },
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 540, y: 1080,
        size: 130,
        font: 'Playfair Display',
        weight: '700',
        color: '#D4AF37',
        anchor: 'middle',
        italic: true
      },
      {
        type: 'sub',
        text: 'Exclusive • {{discount}}% OFF',
        x: 540, y: 1150,
        size: 36,
        font: 'Montserrat',
        weight: '300',
        color: '#FFFFFF',
        anchor: 'middle',
        letterSpacing: 4
      },
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1220,
        size: 44,
        font: 'Montserrat',
        weight: '600',
        color: '#D4AF37',
        anchor: 'middle',
        condition: 'price'
      },
      {
        type: 'sub',
        text: 'linkamarket.co.tz',
        x: 540, y: 1318,
        size: 26,
        font: 'Montserrat',
        weight: '300',
        color: 'rgba(212,175,55,0.6)',
        anchor: 'middle',
        letterSpacing: 2
      }
    ]
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 3. COASTAL NATURAL — Swahili coast warmth, organic, lifestyle feel
  // ──────────────────────────────────────────────────────────────────────────
  coastal_natural: {
    name: 'Swahili Coast',
    canvas: { w: 1080, h: 1350 },
    background: null,

    overlays: [
      // Soft vignette bottom
      {
        type: 'gradient',
        x: 0, y: 750, w: 1080, h: 600,
        gradient: { type: 'linear', from: 'rgba(0,0,0,0)', to: 'rgba(20,14,10,0.75)', angle: 180 }
      },
      // Semi-transparent pill behind headline
      {
        type: 'rounded-rect',
        x: 120, y: 1040, w: 840, h: 160,
        fill: 'rgba(255,255,255,0.12)',
        rx: 80
      }
    ],

    layers: [
      {
        type: 'business',
        text: '{{businessName}}',
        x: 80, y: 80,
        size: 34,
        font: 'Poppins',
        weight: '600',
        color: '#FFFFFF',
        anchor: 'start',
        shadow: true
      },
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 540, y: 1140,
        size: 118,
        font: 'Amatic SC',
        weight: '700',
        color: '#FFFFFF',
        anchor: 'middle',
        shadow: true
      },
      {
        type: 'sub',
        text: 'Punguzo {{discount}}%  •  Haraka Haraka!',
        x: 540, y: 1215,
        size: 40,
        font: 'Poppins',
        weight: '400',
        color: 'rgba(255,220,100,0.9)',
        anchor: 'middle',
        shadow: true
      },
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1290,
        size: 46,
        font: 'Poppins',
        weight: '700',
        color: '#FFFFFF',
        anchor: 'middle',
        shadow: true,
        condition: 'price'
      }
    ]
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 4. SALE BLASTER — flash sale energy, high visibility, WhatsApp share
  // ──────────────────────────────────────────────────────────────────────────
  sale_blaster: {
    name: 'Flash Sale',
    canvas: { w: 1080, h: 1350 },
    background: null,

    overlays: [
      // White card at bottom
      {
        type: 'rounded-rect',
        x: 40, y: 700, w: 1000, h: 590,
        fill: '#FFFFFF',
        rx: 32
      },
      // Red accent bar at very top of card
      {
        type: 'rect',
        x: 40, y: 700, w: 1000, h: 14,
        fill: '#FF0000'
      },
      // Red accent bar at bottom of card
      {
        type: 'rect',
        x: 40, y: 1276, w: 1000, h: 14,
        fill: '#FF0000'
      }
    ],

    layers: [
      // Badge top-left
      {
        type: 'badge',
        text: 'SALE',
        cx: 148, cy: 148, r: 100,
        bg: '#FF0000',
        color: '#FFFFFF',
        font: 'Anton',
        size: 44
      },
      // Percent badge top-right
      {
        type: 'badge',
        text: '-{{discount}}%',
        cx: 932, cy: 148, r: 100,
        bg: '#FF0000',
        color: '#FFFFFF',
        font: 'Anton',
        size: 38
      },
      {
        type: 'headline',
        text: 'FLASH',
        x: 540, y: 870,
        size: 200,
        font: 'Anton',
        weight: '400',
        color: '#FF0000',
        anchor: 'middle',
        letterSpacing: 10
      },
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 540, y: 990,
        size: 68,
        font: 'Poppins',
        weight: '800',
        color: '#111111',
        anchor: 'middle'
      },
      {
        type: 'divider',
        x: 200, y: 1020, w: 680, h: 2,
        fill: '#EEEEEE'
      },
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1100,
        size: 58,
        font: 'Poppins',
        weight: '700',
        color: '#FF0000',
        anchor: 'middle',
        condition: 'price'
      },
      {
        type: 'business',
        text: '{{businessName}}',
        x: 540, y: 1230,
        size: 40,
        font: 'Poppins',
        weight: '600',
        color: '#333333',
        anchor: 'middle',
        uppercase: true,
        letterSpacing: 4
      }
    ]
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 5. MINIMAL CHIC — clean, modern, premium retail feel
  // ──────────────────────────────────────────────────────────────────────────
  minimal_chic: {
    name: 'Minimal Chic',
    canvas: { w: 1080, h: 1350 },
    background: null,

    overlays: [
      // Clean white bottom panel
      {
        type: 'rect',
        x: 0, y: 1020, w: 1080, h: 330,
        fill: 'rgba(255,255,255,0.96)'
      },
      // Single thin black top border on panel
      {
        type: 'rect',
        x: 60, y: 1020, w: 960, h: 1,
        fill: 'rgba(0,0,0,0.15)'
      }
    ],

    layers: [
      // Business name top-left (small wordmark style)
      {
        type: 'business',
        text: '{{businessName}}',
        x: 60, y: 68,
        size: 28,
        font: 'Montserrat',
        weight: '700',
        color: '#FFFFFF',
        anchor: 'start',
        uppercase: true,
        letterSpacing: 6,
        shadow: true
      },
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 60, y: 1130,
        size: 88,
        font: 'Montserrat',
        weight: '900',
        color: '#111111',
        anchor: 'start',
        uppercase: true
      },
      {
        type: 'sub',
        text: '{{discount}}% OFF  ·  {{tagline}}',
        x: 60, y: 1195,
        size: 34,
        font: 'Montserrat',
        weight: '300',
        color: '#555555',
        anchor: 'start',
        letterSpacing: 1
      },
      {
        type: 'price',
        text: '{{price}}',
        x: 60, y: 1270,
        size: 42,
        font: 'Montserrat',
        weight: '600',
        color: '#000000',
        anchor: 'start',
        condition: 'price'
      },
      // Right-side arrow decoration
      {
        type: 'sub',
        text: '→',
        x: 1000, y: 1270,
        size: 60,
        font: 'Montserrat',
        weight: '300',
        color: '#CCCCCC',
        anchor: 'middle'
      }
    ]
  }
};

// ─── Font registry ───────────────────────────────────────────────────────────
// These must be loaded once at server startup via posterRenderer.js
export const FONT_REGISTRY = [
  {
    family: 'Anton',
    weight: '400',
    url: 'https://fonts.gstatic.com/s/anton/v25/1Ptgg87LROyAm3Kz-C8CSKlv.woff2'
  },
  {
    family: 'Poppins',
    weight: '400',
    url: 'https://fonts.gstatic.com/s/poppins/v21/pxiEyp8kv8JHgFVrJJfecg.woff2'
  },
  {
    family: 'Poppins',
    weight: '600',
    url: 'https://fonts.gstatic.com/s/poppins/v21/pxiByp8kv8JHgFVrLEj6Z1xlFQ.woff2'
  },
  {
    family: 'Poppins',
    weight: '700',
    url: 'https://fonts.gstatic.com/s/poppins/v21/pxiByp8kv8JHgFVrLCz7Z1xlFQ.woff2'
  },
  {
    family: 'Poppins',
    weight: '800',
    url: 'https://fonts.gstatic.com/s/poppins/v21/pxiByp8kv8JHgFVrLDD4Z1xlFQ.woff2'
  },
  {
    family: 'Montserrat',
    weight: '300',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-.woff2'
  },
  {
    family: 'Montserrat',
    weight: '700',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCu170w-.woff2'
  },
  {
    family: 'Montserrat',
    weight: '900',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCvr6Ew-.woff2'
  },
  {
    family: 'Playfair Display',
    weight: '700',
    url: 'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.woff2'
  },
  {
    family: 'Amatic SC',
    weight: '700',
    url: 'https://fonts.gstatic.com/s/amaticsc/v26/TUZyzwprpvBS1izr_vO0De6ecZQf1A.woff2'
  }
];
