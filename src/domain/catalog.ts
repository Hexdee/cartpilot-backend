import { createHash } from "node:crypto";
import {
  MerchantOfferSnapshot,
  MerchantRawOffer,
  ProductKey,
  RankingMode,
  SearchIntent,
} from "@/domain/types";

interface ProductEntry {
  key: ProductKey;
  displayName: string;
  aliases: string[];
  searchTerms: string[];
  requiredTerms?: string[];
  rejectTerms?: string[];
  followUp: string;
}

const productCatalog: Record<ProductKey, ProductEntry> = {
  custom: {
    key: "custom",
    displayName: "Requested product",
    aliases: [],
    searchTerms: [],
    rejectTerms: [],
    followUp: "I can refine the shortlist further if you want a budget, brand, delivery speed, size, or seller preference.",
  },
  sony_wh1000xm5: {
    key: "sony_wh1000xm5",
    displayName: "Sony WH-1000XM5 headphones",
    aliases: ["sony wh-1000xm5", "sony xm5", "xm5", "headphones", "noise-cancelling headphones", "headphone", "headset"],
    searchTerms: ["sony", "wh-1000xm5", "1000xm5", "xm5", "headphone", "headphones", "headset"],
    rejectTerms: ["blender", "chair", "fryer", "controller"],
    followUp: "Would you like me to prioritize official stores only, or include trusted third-party sellers if they are cheaper?",
  },
  office_chair: {
    key: "office_chair",
    displayName: "Office chair with lumbar support",
    aliases: ["office chair", "desk chair", "lumbar support chair", "chair", "ergonomic chair"],
    searchTerms: ["office chair", "chair", "desk chair", "ergonomic", "lumbar"],
    rejectTerms: ["headphone", "blender", "fryer", "controller"],
    followUp: "Should I emphasize ergonomic comfort, rating, or the lowest delivered price?",
  },
  portable_blender: {
    key: "portable_blender",
    displayName: "Portable blender",
    aliases: ["portable blender", "travel blender", "usb blender", "blender", "smoothie blender"],
    searchTerms: ["blender", "portable", "usb", "rechargeable", "smoothie"],
    requiredTerms: ["portable", "usb", "rechargeable", "smoothie", "juicer", "mini", "on-the-go"],
    rejectTerms: ["headphone", "chair", "controller", "industrial", "crusher", "manual", "hand blender", "food processor"],
    followUp: "Do you care more about portability, battery life, or getting the lowest total cost?",
  },
  ps5_controller: {
    key: "ps5_controller",
    displayName: "PS5 controller",
    aliases: ["ps5 controller", "dualsense", "playstation controller", "controller", "gamepad"],
    searchTerms: ["ps5", "dualsense", "controller", "gamepad", "playstation"],
    rejectTerms: ["headphone", "blender", "chair", "fryer"],
    followUp: "Should I keep the shortlist to official sellers only, or include reputable marketplace offers?",
  },
  air_fryer: {
    key: "air_fryer",
    displayName: "Air fryer",
    aliases: ["air fryer", "airfryer", "fryer"],
    searchTerms: ["air fryer", "airfryer", "fryer"],
    rejectTerms: ["headphone", "blender", "chair", "controller"],
    followUp: "Do you want the top result to optimize for warranty, rating, or the lowest landed cost?",
  },
};

const stopWords = new Set([
  "the",
  "a",
  "an",
  "for",
  "and",
  "or",
  "with",
  "under",
  "below",
  "best",
  "rated",
  "fast",
  "fastest",
  "cheap",
  "cheapest",
  "deal",
  "delivery",
  "buy",
  "find",
  "need",
  "want",
  "please",
  "naira",
]);

const conversationalPrefixPatterns = [
  /^(?:please\s+)?(?:get|find|show|buy|search(?:\s+for)?|look(?:ing)?\s+for)\s+(?:me\s+)?/i,
  /^(?:i\s+)?(?:need|want)\s+/i,
  /^(?:can you|could you|help me)\s+/i,
];

const rankingPhrasePatterns = [
  /\bbest deal for\b/gi,
  /\bbest deal\b/gi,
  /\bcheapest\b/gi,
  /\blowest price\b/gi,
  /\bbest rated\b/gi,
  /\bhighest rated\b/gi,
  /\bfastest delivery\b/gi,
  /\bfast delivery\b/gi,
  /\bdeliver(?:y)? quickly\b/gi,
];

const fillerPhrasePatterns = [
  /\bfor me\b/gi,
  /\bplease\b/gi,
  /\bright now\b/gi,
  /\btoday\b/gi,
  /\bavailable\b/gi,
  /\bin nigeria\b/gi,
  /\bnear me\b/gi,
];

const accessoryRejectTerms = [
  "case",
  "cover",
  "sleeve",
  "skin",
  "protector",
  "keyboard cover",
  "screen guard",
  "screen protector",
  "bag",
  "pouch",
  "shell",
  "holder",
  "stand",
  "dock",
  "charger",
  "charging case",
  "charging cable",
  "cable",
  "adapter",
  "replacement",
  "spare",
  "accessory",
  "strap",
  "mount",
  "remote cover",
  "travel case",
];

const miniatureRejectTerms = [
  "mini",
  "tiny",
  "pocket",
  "handheld",
  "desktop",
  "desk",
  "usb",
  "humidifier",
  "fan",
  "toy",
  "figurine",
  "model",
  "ornament",
  "portable ac fan",
  "air cooler",
  "mini cooler",
];

const explicitAccessoryIntentTerms = [
  "case",
  "cover",
  "sleeve",
  "skin",
  "protector",
  "keyboard cover",
  "screen guard",
  "screen protector",
  "bag",
  "pouch",
  "shell",
  "accessory",
  "charger",
  "cable",
  "adapter",
  "replacement",
  "spare",
  "strap",
  "mount",
  "stand",
  "dock",
];

const explicitMiniatureIntentTerms = [
  "mini",
  "tiny",
  "pocket",
  "handheld",
  "usb",
  "desktop",
  "desk",
  "portable",
  "travel",
];

const largeApplianceTerms = [
  "air conditioner",
  "ac",
  "refrigerator",
  "fridge",
  "freezer",
  "washing machine",
  "microwave",
  "television",
  "tv",
];

const seedOffers: Omit<MerchantOfferSnapshot, "totalCost">[] = [
  {
    id: "jumia-sony-wh1000xm5",
    merchant: "Jumia",
    merchantCategory: "live",
    title: "Sony WH-1000XM5 Wireless Noise-Cancelling Headphones",
    summary: "Fastest local delivery slot with an official merchant listing and strong customer confidence.",
    sourceUrl: "https://www.jumia.com.ng/",
    productKey: "sony_wh1000xm5",
    price: 648000,
    shippingCost: 15500,
    rating: 4.8,
    etaHours: 6,
    etaLabel: "Today, 4:10 PM",
    availability: "In stock",
    officialStore: true,
    color: "black",
  },
  {
    id: "konga-sony-wh1000xm5",
    merchant: "Konga",
    merchantCategory: "live",
    title: "Sony WH-1000XM5 Bluetooth Headphones - Black",
    summary: "Lower total cost than Jumia, though the delivery window is slightly later.",
    sourceUrl: "https://www.konga.com/",
    productKey: "sony_wh1000xm5",
    price: 639900,
    shippingCost: 22000,
    rating: 4.7,
    etaHours: 6.2,
    etaLabel: "Today, 4:22 PM",
    availability: "In stock",
    officialStore: false,
    color: "black",
  },
  {
    id: "jumia-office-chair",
    merchant: "Jumia",
    merchantCategory: "live",
    title: "Ergonomic Office Chair with Adjustable Lumbar Support",
    summary: "Fast local delivery with the strongest review mix in this shortlist.",
    sourceUrl: "https://www.jumia.com.ng/",
    productKey: "office_chair",
    price: 231000,
    shippingCost: 14500,
    rating: 4.7,
    etaHours: 14,
    etaLabel: "Tomorrow, 9:00 AM",
    availability: "In stock",
    officialStore: false,
  },
  {
    id: "konga-office-chair",
    merchant: "Konga",
    merchantCategory: "live",
    title: "Mesh Office Chair with Headrest and Lumbar Support",
    summary: "Lower total cost, though the delivery ETA trails the top option.",
    sourceUrl: "https://www.konga.com/",
    productKey: "office_chair",
    price: 224000,
    shippingCost: 12000,
    rating: 4.6,
    etaHours: 18,
    etaLabel: "Tomorrow, 1:00 PM",
    availability: "In stock",
    officialStore: true,
  },
  {
    id: "konga-portable-blender",
    merchant: "Konga",
    merchantCategory: "live",
    title: "Portable USB Blender Bottle",
    summary: "Strong local rating and a delivered price comfortably below target.",
    sourceUrl: "https://www.konga.com/",
    productKey: "portable_blender",
    price: 33500,
    shippingCost: 2500,
    rating: 4.5,
    etaHours: 7,
    etaLabel: "Today, 5:00 PM",
    availability: "In stock",
    officialStore: false,
  },
  {
    id: "jumia-portable-blender",
    merchant: "Jumia",
    merchantCategory: "live",
    title: "Rechargeable Portable Blender Cup",
    summary: "Fast dispatch and slightly better battery life than the alternative offer.",
    sourceUrl: "https://www.jumia.com.ng/",
    productKey: "portable_blender",
    price: 34900,
    shippingCost: 2000,
    rating: 4.4,
    etaHours: 6,
    etaLabel: "Today, 4:00 PM",
    availability: "In stock",
    officialStore: false,
  },
  {
    id: "jumia-ps5-controller",
    merchant: "Jumia",
    merchantCategory: "live",
    title: "Sony DualSense Wireless Controller for PS5",
    summary: "Fast local dispatch with the most reliable availability today.",
    sourceUrl: "https://www.jumia.com.ng/",
    productKey: "ps5_controller",
    price: 79000,
    shippingCost: 3500,
    rating: 4.8,
    etaHours: 5,
    etaLabel: "Today, 3:30 PM",
    availability: "In stock",
    officialStore: true,
  },
  {
    id: "konga-ps5-controller",
    merchant: "Konga",
    merchantCategory: "live",
    title: "PS5 DualSense Controller Standard White",
    summary: "Cheapest total cost, with a slightly lower seller confidence score.",
    sourceUrl: "https://www.konga.com/",
    productKey: "ps5_controller",
    price: 76000,
    shippingCost: 5000,
    rating: 4.5,
    etaHours: 8,
    etaLabel: "Today, 6:00 PM",
    availability: "In stock",
    officialStore: false,
  },
  {
    id: "jumia-air-fryer",
    merchant: "Jumia",
    merchantCategory: "live",
    title: "8L Digital Air Fryer with Touch Control",
    summary: "Strong local rating, fast dispatch, and a balanced delivered price.",
    sourceUrl: "https://www.jumia.com.ng/",
    productKey: "air_fryer",
    price: 119000,
    shippingCost: 6500,
    rating: 4.6,
    etaHours: 10,
    etaLabel: "Today, 6:30 PM",
    availability: "In stock",
    officialStore: false,
  },
  {
    id: "konga-air-fryer",
    merchant: "Konga",
    merchantCategory: "live",
    title: "7L Rapid Air Fryer with 12-Month Warranty",
    summary: "Warranty is strongest here, with a slightly slower arrival window.",
    sourceUrl: "https://www.konga.com/",
    productKey: "air_fryer",
    price: 113000,
    shippingCost: 9000,
    rating: 4.5,
    etaHours: 13,
    etaLabel: "Tomorrow, 10:00 AM",
    availability: "In stock",
    officialStore: true,
  },
];

export function parseMoney(rawValue: string): number {
  const sanitized = rawValue.replace(/[^\d.]/g, "");
  if (!sanitized) return 0;
  const numeric = Number.parseFloat(sanitized);
  if (Number.isNaN(numeric)) return 0;
  if (/[kK]\b/.test(rawValue)) return numeric * 1000;
  if (/[mM]\b/.test(rawValue)) return numeric * 1_000_000;
  return numeric;
}

export function parseRating(rawValue: string | undefined): number | null {
  if (!rawValue) return null;
  const match = rawValue.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const rating = Number.parseFloat(match[1]);
  if (Number.isNaN(rating)) return null;
  return Math.max(0, Math.min(5, rating));
}

export function getDefaultMerchantShipping(merchant: string) {
  switch (merchant.toLowerCase()) {
    case "jumia":
      return 4500;
    case "konga":
      return 5500;
    case "jiji":
      return 3000;
    case "aliexpress":
      return 12000;
    default:
      return 5000;
  }
}

export function getDefaultMerchantEta(merchant: string) {
  switch (merchant.toLowerCase()) {
    case "jumia":
      return { hours: 36, label: "1-2 business days" };
    case "konga":
      return { hours: 48, label: "2-3 business days" };
    case "jiji":
      return { hours: 48, label: "1-3 business days" };
    case "aliexpress":
      return { hours: 336, label: "2-3 weeks" };
    default:
      return { hours: 48, label: "2-3 business days" };
  }
}

export function buildOfferId(merchant: string, title: string, sourceUrl: string) {
  const input = `${merchant}:${title}:${sourceUrl}`;
  return `${merchant.toLowerCase()}-${createHash("sha1").update(input).digest("hex").slice(0, 12)}`;
}

export function detectRankingMode(message: string): RankingMode {
  const lower = message.toLowerCase();
  if (lower.includes("cheap") || lower.includes("cheapest") || lower.includes("deal")) {
    return "lowest_total_price";
  }
  if (lower.includes("rating") || lower.includes("best rated") || lower.includes("best-rated")) {
    return "highest_rating";
  }
  if (
    lower.includes("fast") ||
    lower.includes("delivery") ||
    lower.includes("same-day") ||
    lower.includes("today")
  ) {
    return "fastest_delivery";
  }
  return "balanced";
}

export function detectBudget(message: string): number | null {
  const match = message.match(
    /(?:under|below|budget(?:\s+of)?|less than)\s*[₦$]?\s*([\d.,]+(?:[kKmM])?)/i,
  );
  return match ? parseMoney(match[1]) : null;
}

export function detectColor(message: string): string | null {
  const colors = ["black", "white", "blue", "silver", "red"];
  const lower = message.toLowerCase();
  return colors.find((color) => lower.includes(color)) ?? null;
}

export function extractSearchQuery(message: string): string {
  let query = message.trim();

  for (const pattern of conversationalPrefixPatterns) {
    query = query.replace(pattern, "");
  }

  for (const pattern of rankingPhrasePatterns) {
    query = query.replace(pattern, " ");
  }

  query = query.replace(
    /(?:under|below|budget(?:\s+of)?|less than)\s*[₦$]?\s*[\d.,]+(?:[kKmM])?/gi,
    " ",
  );

  for (const pattern of fillerPhrasePatterns) {
    query = query.replace(pattern, " ");
  }

  query = query
    .replace(/\s+/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "");

  query = query.replace(/^(?:the|a|an)\s+/i, "");

  return query || message.trim();
}

export function detectProductKey(message: string): ProductKey {
  const lower = extractSearchQuery(message).toLowerCase();
  const entry = Object.values(productCatalog).find((candidate) =>
    candidate.aliases.some((alias) => lower.includes(alias)),
  );
  return entry?.key ?? "custom";
}

export function getProductEntry(productKey: ProductKey): ProductEntry {
  return productCatalog[productKey];
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function getQueryTokens(intent: SearchIntent) {
  return tokenize(intent.query);
}

function hasExplicitIntentTerm(query: string, terms: string[]) {
  const lower = query.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function countHits(haystack: string, terms: string[]) {
  return terms.filter((term) => haystack.includes(term)).length;
}

function hasAccessoryMismatch(intent: SearchIntent, haystack: string) {
  if (hasExplicitIntentTerm(intent.query, explicitAccessoryIntentTerms)) {
    return false;
  }

  return countHits(haystack, accessoryRejectTerms) > 0;
}

function hasMiniatureMismatch(intent: SearchIntent, haystack: string) {
  if (hasExplicitIntentTerm(intent.query, explicitMiniatureIntentTerms)) {
    return false;
  }

  const largeApplianceIntent = hasExplicitIntentTerm(intent.query, largeApplianceTerms);
  const miniatureHits = countHits(haystack, miniatureRejectTerms);

  if (miniatureHits === 0) {
    return false;
  }

  if (largeApplianceIntent) {
    return true;
  }

  return miniatureHits > 0;
}

function hasStrongCustomIntentMatch(intent: SearchIntent, haystack: string) {
  const query = intent.query.toLowerCase().trim();
  const queryTokens = getQueryTokens(intent);
  const matchedQueryTokens = queryTokens.filter((term) => haystack.includes(term));
  const exactPhraseHit = query.length >= 5 && haystack.includes(query);
  const trailingPhrase =
    queryTokens.length >= 2 ? queryTokens.slice(-2).join(" ") : null;
  const trailingPhraseHit = trailingPhrase ? haystack.includes(trailingPhrase) : false;
  const modelLikeTokens = queryTokens.filter((token) => /\d/.test(token) || token.length >= 5);
  const matchedModelLikeTokens = modelLikeTokens.filter((term) => haystack.includes(term));

  if (exactPhraseHit) {
    return true;
  }

  if (queryTokens.length === 0) {
    return false;
  }

  if (queryTokens.length === 1) {
    return matchedQueryTokens.length >= 1;
  }

  if (trailingPhraseHit) {
    return true;
  }

  const minimumMatchCount = Math.min(
    queryTokens.length,
    Math.max(2, Math.ceil(queryTokens.length * 0.75)),
  );

  if (queryTokens.length >= 3 && !trailingPhraseHit) {
    if (modelLikeTokens.length > 0 && matchedModelLikeTokens.length === modelLikeTokens.length) {
      return matchedQueryTokens.length >= minimumMatchCount;
    }
    return false;
  }

  if (matchedQueryTokens.length >= minimumMatchCount) {
    return true;
  }

  if (modelLikeTokens.length > 0 && matchedModelLikeTokens.length === modelLikeTokens.length) {
    return matchedQueryTokens.length >= Math.max(2, Math.min(queryTokens.length, minimumMatchCount - 1));
  }

  return false;
}

export function getSearchTermsForIntent(intent: SearchIntent) {
  const entry = getProductEntry(intent.productKey);
  const queryTerms = tokenize(intent.query);
  const aliasTerms = entry.searchTerms.flatMap((term) => tokenize(term));
  return [...new Set([...aliasTerms, ...queryTerms])];
}

export function isRelevantMerchantText(intent: SearchIntent, text: string) {
  const haystack = text.toLowerCase();
  const entry = getProductEntry(intent.productKey);
  const terms = getSearchTermsForIntent(intent);
  const positiveHits = terms.filter((term) => haystack.includes(term));
  const requiredHits = (entry.requiredTerms ?? []).filter((term) => haystack.includes(term));
  const rejectHits = (entry.rejectTerms ?? []).filter((term) => haystack.includes(term));

  if (rejectHits.length > 0 && positiveHits.length < 2) {
    return false;
  }

  if (hasAccessoryMismatch(intent, haystack)) {
    return false;
  }

  if (hasMiniatureMismatch(intent, haystack)) {
    return false;
  }

  if (entry.requiredTerms?.length && requiredHits.length === 0) {
    const exactAliasHit = entry.aliases.some((alias) => haystack.includes(alias.toLowerCase()));
    if (!exactAliasHit) {
      return false;
    }
  }

  if (intent.productKey === "custom") {
    return hasStrongCustomIntentMatch(intent, haystack);
  }

  const strongAliasHit = entry.aliases.some((alias) => haystack.includes(alias.toLowerCase()));
  return strongAliasHit || positiveHits.length >= 2;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getOfferSeed(productKey: ProductKey): MerchantOfferSnapshot[] {
  return seedOffers
    .filter((offer) => offer.productKey === productKey)
    .map((offer) => ({
      ...offer,
      totalCost: offer.price + offer.shippingCost,
    }));
}

export function seedSnapshotToRawOffer(offer: MerchantOfferSnapshot): MerchantRawOffer {
  return {
    id: offer.id,
    merchant: offer.merchant,
    sourceUrl: offer.sourceUrl,
    title: offer.title,
    summary: offer.summary,
    price: offer.price,
    priceText: String(offer.price),
    shippingCost: offer.shippingCost,
    shippingText: String(offer.shippingCost),
    rating: offer.rating,
    ratingText: String(offer.rating),
    etaHours: offer.etaHours,
    etaText: offer.etaLabel,
    availabilityText: offer.availability,
    officialStore: offer.officialStore,
    color: offer.color ?? null,
    raw: {
      source: "seed",
    },
  };
}

export function scoreOffer(offer: MerchantOfferSnapshot, mode: RankingMode): number {
  const deliveryScore = 1 / offer.etaHours;
  const priceScore = 1 / offer.totalCost;
  const ratingScore = offer.rating / 5;

  switch (mode) {
    case "fastest_delivery":
      return deliveryScore * 0.55 + priceScore * 0.3 + ratingScore * 0.15;
    case "lowest_total_price":
      return priceScore * 0.6 + deliveryScore * 0.25 + ratingScore * 0.15;
    case "highest_rating":
      return ratingScore * 0.6 + priceScore * 0.2 + deliveryScore * 0.2;
    case "balanced":
      return deliveryScore * 0.35 + priceScore * 0.35 + ratingScore * 0.3;
  }
}

export function rankOffers(intent: SearchIntent, offers: MerchantOfferSnapshot[]): MerchantOfferSnapshot[] {
  const colorFiltered = offers.filter(
    (offer) => !intent.color || !offer.color || offer.color === intent.color,
  );

  let inBudget = colorFiltered;
  if (typeof intent.budget === "number") {
    const budget = intent.budget;
    inBudget = colorFiltered.filter((offer) => offer.totalCost <= budget);
  }

  const source = inBudget.length ? inBudget : colorFiltered;

  return [...source].sort((left, right) => {
    const scoreDifference = scoreOffer(right, intent.rankingMode) - scoreOffer(left, intent.rankingMode);
    if (scoreDifference !== 0) return scoreDifference;
    return left.totalCost - right.totalCost;
  });
}
