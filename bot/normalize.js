const PRODUCT_MAP = {
  'gauni': 'elegant dress',
  'kitenge': 'kitenge African wax print fabric',
  'shati': 'dress shirt',
  'suruali': 'trousers',
  'viatu': 'shoes',
  'begi': 'handbag',
  'mkoba': 'handbag',
  'simu': 'smartphone',
  'kompyuta': 'laptop computer',
  'tv': 'television',
  'friji': 'refrigerator',
  'chakula': 'food dish',
  'keki': 'cake',
  'pilau': 'spiced pilau rice dish',
  'biryani': 'biryani rice dish',
  'juisi': 'fruit juice',
  'urembo': 'beauty cosmetics',
  'sabuni': 'soap',
  'mafuta': 'body oil',
  'dawa': 'herbal supplement',
  'pete': 'ring jewelry',
  'mkufu': 'necklace',
  'bangili': 'bracelet',
  'masikio': 'earrings',
  'saa': 'wristwatch',
  'miwani': 'sunglasses',
  'kofia': 'hat or cap',
  'mtoto': 'children\'s clothing',
  'nguo': 'clothing',
  'bidhaa': 'product'
};

// ─── Offer phrase map ────────────────────────────────────────────────────────
export const SWAHILI_OFFERS = {
  sale:       { sw: 'OFA KABAMBE',  en: 'Big Offer' },
  new:        { sw: 'MZIGO MPYA',   en: 'New Arrival' },
  discount:   { sw: 'PUNGUZO',      en: 'Discount' },
  price:      { sw: 'BEI POA',      en: 'Good Price' },
  limited:    { sw: 'HARAKA HARAKA',en: 'Limited Time' },
  exclusive:  { sw: 'PEKEE YAKE',   en: 'Exclusive' },
  restock:    { sw: 'IMEFIKA TENA', en: 'Back in Stock' }
};

// ─── Style validation ────────────────────────────────────────────────────────
const VALID_STYLES = ['bold', 'luxury', 'natural', 'minimal', 'festive'];

// ─── Template mapping ────────────────────────────────────────────────────────
export const STYLE_TO_TEMPLATE = {
  bold:    'kariakoo_bold',
  luxury:  'luxury_gold',
  natural: 'coastal_natural',
  minimal: 'minimal_chic',
  festive: 'sale_blaster'
};

// ─── Main normalizer ─────────────────────────────────────────────────────────
export function normalizeMerchant(raw) {
  // 1. Business name — multiple field fallbacks + sanitize
  const businessName = sanitize(
    raw.businessName || raw.jina_biashara || raw.jina || raw.name || raw.phone || 'Duka Letu'
  );

  // 2. Product — translate Swahili keywords to English for image prompt
  const productRaw = (raw.bidhaa || raw.product || raw.item || 'bidhaa').trim();
  const productEn = translateProduct(productRaw);

  // 3. Style validation with fallback
  const styleRaw = (raw.style || raw.mtindo || '').toLowerCase().trim();
  const style = VALID_STYLES.includes(styleRaw) ? styleRaw : 'bold';

  // 4. Offer type
  const offerTypeRaw = (raw.offerType || raw.aina_ya_ofa || 'sale').toLowerCase().trim();
  const offerType = SWAHILI_OFFERS[offerTypeRaw] ? offerTypeRaw : 'sale';
  const offerData = SWAHILI_OFFERS[offerType];

  // 5. Discount value — strip non-numeric, clamp 1-99
  let discount = parseInt(String(raw.discount || raw.punguzo || '50').replace(/\D/g, ''), 10);
  if (isNaN(discount) || discount < 1 || discount > 99) discount = 50;

  // 6. Price (optional)
  const price = raw.price || raw.bei || null;
  const priceDisplay = price ? formatPrice(price) : null;

  // 7. Tagline (optional Swahili/English short phrase)
  const tagline = sanitize(raw.tagline || raw.kauli || '');

  // 8. Template
  const templateId = STYLE_TO_TEMPLATE[style];

  return {
    businessName,
    product: `${productEn}, Tanzania`,
    productRaw,
    style,
    templateId,
    offerType,
    offerPhrase: offerData.sw,
    offerPhraseEn: offerData.en,
    discount: String(discount),
    price: priceDisplay,
    tagline
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function translateProduct(raw) {
  let result = raw.toLowerCase();
  // Replace known Swahili words
  for (const [sw, en] of Object.entries(PRODUCT_MAP)) {
    result = result.replace(new RegExp(`\\b${sw}\\b`, 'gi'), en);
  }
  // Capitalise first letter
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function sanitize(str) {
  return String(str)
    .trim()
    .replace(/[<>"'&]/g, '') // strip HTML-dangerous chars
    .replace(/\s+/g, ' ')
    .substring(0, 80);       // max 80 chars for overlay
}

function formatPrice(price) {
  const num = parseInt(String(price).replace(/\D/g, ''), 10);
  if (isNaN(num)) return null;
  // Format as TZS with comma thousands separator
  return `TZS ${num.toLocaleString('en-TZ')}`;
}
