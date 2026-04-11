/**
 * LinkaMarket Poster Templates — v3
 * Inspired by real brand references: clean studio, product hero, text top/bottom
 * Canvas: 1080×1350 (4:5 Instagram Portrait)
 */

export const TEMPLATES = {

  // ── 1. STUDIO BOLD ───────────────────────────────────────────────────────────
  // Ref: Image 5 (Feature Labor Day Sale) — text top, product centre, info bottom
  // Clean grey studio, big headline at top, discount info at bottom strip
  kariakoo_bold: {
    name: 'Studio Bold',
    canvas: { w: 1080, h: 1350 },

    overlays: [
      // Top white strip for headline
      {
        type: 'rect',
        x: 0, y: 0, w: 1080, h: 220,
        fill: '#FFFFFF'
      },
      // Bottom white strip for price/business
      {
        type: 'rect',
        x: 0, y: 1080, w: 1080, h: 270,
        fill: '#FFFFFF'
      },
      // Thin top border accent
      {
        type: 'rect',
        x: 0, y: 0, w: 1080, h: 6,
        fill: '#111111'
      },
      // Thin bottom border accent
      {
        type: 'rect',
        x: 0, y: 1344, w: 1080, h: 6,
        fill: '#111111'
      }
    ],

    layers: [
      // Business name — top center, small caps
      {
        type: 'business',
        text: '{{businessName}}',
        x: 540, y: 60,
        size: 28,
        font: 'Montserrat',
        weight: '700',
        color: '#111111',
        anchor: 'middle',
        uppercase: true,
        letterSpacing: 10
      },
      // Main offer headline
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 540, y: 175,
        size: 108,
        font: 'Anton',
        weight: '400',
        color: '#111111',
        anchor: 'middle',
        letterSpacing: 2
      },
      // Discount line
      {
        type: 'sub',
        text: 'Punguzo hadi {{discount}}% OFF',
        x: 540, y: 1160,
        size: 52,
        font: 'Montserrat',
        weight: '800',
        color: '#111111',
        anchor: 'middle'
      },
      // Divider
      {
        type: 'divider',
        x: 200, y: 1195, w: 680, h: 2,
        fill: '#EEEEEE'
      },
      // Price
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1260,
        size: 44,
        font: 'Montserrat',
        weight: '600',
        color: '#111111',
        anchor: 'middle',
        condition: 'price'
      },
      // Tagline
      {
        type: 'sub',
        text: 'linkamarket.co.tz',
        x: 540, y: 1318,
        size: 24,
        font: 'Montserrat',
        weight: '300',
        color: '#999999',
        anchor: 'middle',
        letterSpacing: 3
      }
    ]
  },

  // ── 2. LUXURY GOLD ───────────────────────────────────────────────────────────
  // Ref: Image 1 (SALE pink studio) — product bleeds full, text overlays bottom
  // Soft pastel background from AI, large SALE word overlaid on product
  luxury_gold: {
    name: 'Luxury Gold',
    canvas: { w: 1080, h: 1350 },

    overlays: [
      // Gradient scrim — bottom half only, subtle
      {
        type: 'gradient',
        x: 0, y: 600, w: 1080, h: 750,
        gradient: { type: 'linear', from: 'rgba(0,0,0,0)', to: 'rgba(0,0,0,0.72)', angle: 180 }
      },
      // Gold accent line
      {
        type: 'rect',
        x: 80, y: 1340, w: 920, h: 4,
        fill: '#D4AF37'
      }
    ],

    layers: [
      // Business name top-left
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
        letterSpacing: 8,
        shadow: true
      },
      // Big SALE word overlaid on product — like reference image 1
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 540, y: 1000,
        size: 160,
        font: 'Anton',
        weight: '400',
        color: '#FFFFFF',
        anchor: 'middle',
        shadow: true
      },
      // Discount sub
      {
        type: 'sub',
        text: 'Hadi {{discount}}% OFF',
        x: 540, y: 1090,
        size: 54,
        font: 'Montserrat',
        weight: '700',
        color: '#D4AF37',
        anchor: 'middle',
        shadow: true
      },
      // Price
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1180,
        size: 48,
        font: 'Montserrat',
        weight: '600',
        color: '#FFFFFF',
        anchor: 'middle',
        shadow: true,
        condition: 'price'
      },
      // Tagline bottom
      {
        type: 'sub',
        text: 'linkamarket.co.tz',
        x: 540, y: 1310,
        size: 26,
        font: 'Montserrat',
        weight: '300',
        color: 'rgba(212,175,55,0.8)',
        anchor: 'middle',
        letterSpacing: 3
      }
    ]
  },

  // ── 3. COASTAL NATURAL ───────────────────────────────────────────────────────
  // Ref: Image 2 (Ramadan Sale) — split layout, big text top-left, image bottom-right
  // White top half with big text, product image dominates bottom
  coastal_natural: {
    name: 'Swahili Coast',
    canvas: { w: 1080, h: 1350 },

    overlays: [
      // White header block — top 35%
      {
        type: 'rect',
        x: 0, y: 0, w: 1080, h: 460,
        fill: '#FFFFFF'
      },
      // Accent colour block — right side middle (like Ramadan Sale ref)
      {
        type: 'rect',
        x: 600, y: 380, w: 480, h: 300,
        fill: '#F5EFE6'
      },
      // Bottom info strip
      {
        type: 'rect',
        x: 0, y: 1220, w: 1080, h: 130,
        fill: 'rgba(0,0,0,0.55)'
      }
    ],

    layers: [
      // Large offer text top-left — like "RAMADAN SALE"
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 60, y: 220,
        size: 130,
        font: 'Anton',
        weight: '400',
        color: '#1a1a1a',
        anchor: 'start'
      },
      // Sub — second line
      {
        type: 'sub',
        text: 'Punguzo {{discount}}%',
        x: 60, y: 370,
        size: 52,
        font: 'Montserrat',
        weight: '300',
        color: '#555555',
        anchor: 'start',
        letterSpacing: 2
      },
      // Price bottom strip
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1290,
        size: 44,
        font: 'Montserrat',
        weight: '700',
        color: '#FFFFFF',
        anchor: 'middle',
        condition: 'price'
      },
      // Business name bottom strip
      {
        type: 'business',
        text: '{{businessName}}',
        x: 540, y: 1330,
        size: 28,
        font: 'Montserrat',
        weight: '400',
        color: 'rgba(255,255,255,0.8)',
        anchor: 'middle',
        uppercase: true,
        letterSpacing: 6
      }
    ]
  },

  // ── 4. SALE BLASTER ───────────────────────────────────────────────────────────
  // Ref: Image 4 (Bold coral studio) — solid colour background, product on pedestal
  // Bright solid background, clean product, headline top, brand bottom
  sale_blaster: {
    name: 'Flash Sale',
    canvas: { w: 1080, h: 1350 },

    overlays: [
      // Top text zone — white
      {
        type: 'rect',
        x: 0, y: 0, w: 1080, h: 180,
        fill: '#FFFFFF'
      },
      // Bottom info zone — white
      {
        type: 'rect',
        x: 0, y: 1130, w: 1080, h: 220,
        fill: '#FFFFFF'
      },
      // Left yellow accent bar — like reference image 4
      {
        type: 'rect',
        x: 0, y: 0, w: 12, h: 1350,
        fill: '#FFD600'
      },
      // Bottom yellow accent bar
      {
        type: 'rect',
        x: 0, y: 1338, w: 1080, h: 12,
        fill: '#FFD600'
      }
    ],

    layers: [
      // Business name top
      {
        type: 'business',
        text: '{{businessName}}',
        x: 540, y: 58,
        size: 26,
        font: 'Montserrat',
        weight: '700',
        color: '#111111',
        anchor: 'middle',
        uppercase: true,
        letterSpacing: 8
      },
      // Offer phrase
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 540, y: 148,
        size: 96,
        font: 'Anton',
        weight: '400',
        color: '#111111',
        anchor: 'middle'
      },
      // Discount
      {
        type: 'sub',
        text: '{{discount}}% OFF — LEO TU!',
        x: 540, y: 1210,
        size: 52,
        font: 'Montserrat',
        weight: '800',
        color: '#111111',
        anchor: 'middle'
      },
      // Price
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1295,
        size: 46,
        font: 'Montserrat',
        weight: '600',
        color: '#111111',
        anchor: 'middle',
        condition: 'price'
      }
    ]
  },

  // ── 5. MINIMAL CHIC ───────────────────────────────────────────────────────────
  // Ref: Image 6 (TrunkClub) — pure white/grey bg, text top, brand bottom, airy
  // Most minimal: clean grey studio, headline top, business bottom, lots of space
  minimal_chic: {
    name: 'Minimal Chic',
    canvas: { w: 1080, h: 1350 },

    overlays: [
      // Subtle top text zone
      {
        type: 'rect',
        x: 0, y: 0, w: 1080, h: 160,
        fill: 'rgba(255,255,255,0.95)'
      },
      // Clean bottom strip
      {
        type: 'rect',
        x: 0, y: 1240, w: 1080, h: 110,
        fill: 'rgba(255,255,255,0.95)'
      },
      // Single thin line top
      {
        type: 'rect',
        x: 60, y: 155, w: 960, h: 1,
        fill: 'rgba(0,0,0,0.1)'
      }
    ],

    layers: [
      // Headline top — like "Spring Style Trend"
      {
        type: 'headline',
        text: '{{offerPhrase}}',
        x: 540, y: 80,
        size: 72,
        font: 'Montserrat',
        weight: '900',
        color: '#111111',
        anchor: 'middle',
        uppercase: true,
        letterSpacing: 2
      },
      // Sub top
      {
        type: 'sub',
        text: 'Punguzo hadi {{discount}}%',
        x: 540, y: 132,
        size: 34,
        font: 'Montserrat',
        weight: '300',
        color: '#666666',
        anchor: 'middle',
        letterSpacing: 4,
        uppercase: true
      },
      // Price bottom
      {
        type: 'price',
        text: '{{price}}',
        x: 540, y: 1272,
        size: 38,
        font: 'Montserrat',
        weight: '600',
        color: '#111111',
        anchor: 'middle',
        condition: 'price'
      },
      // Business name bottom — like "TRUNKCLUB.COM"
      {
        type: 'business',
        text: '{{businessName}}',
        x: 540, y: 1320,
        size: 26,
        font: 'Montserrat',
        weight: '700',
        color: '#333333',
        anchor: 'middle',
        uppercase: true,
        letterSpacing: 8
      }
    ]
  }
};

// ─── Font registry ────────────────────────────────────────────────────────────
export const FONT_REGISTRY = [
  {
    family: 'Anton',
    weight: '400',
    url: 'https://fonts.gstatic.com/s/anton/v25/1Ptgg87LROyAm3Kz-C8CSKlv.woff2'
  },
  {
    family: 'Montserrat',
    weight: '300',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-.woff2'
  },
  {
    family: 'Montserrat',
    weight: '400',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuM70w-.woff2'
  },
  {
    family: 'Montserrat',
    weight: '600',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCu173w-.woff2'
  },
  {
    family: 'Montserrat',
    weight: '700',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCu170w-.woff2'
  },
  {
    family: 'Montserrat',
    weight: '800',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuV73w-.woff2'
  },
  {
    family: 'Montserrat',
    weight: '900',
    url: 'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCvr6Ew-.woff2'
  }
];
