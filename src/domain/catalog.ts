import { createHash } from "node:crypto";
import {
  MerchantOfferSnapshot,
  MerchantRawOffer,
  ProductKey,
  RankingMode,
  SearchIntent,
} from "@/domain/types";



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

export function detectProductKey(_message: string): ProductKey {
  return "custom";
}

export function getProductEntry(_productKey: ProductKey) {
  return {
    key: "custom",
    displayName: "Requested product",
    followUp: "I can refine the shortlist further if you want a budget, brand, delivery speed, size, or seller preference.",
  };
}

const stopWords = new Set([
  "the", "a", "an", "for", "and", "or", "with", "under", "below", "best", "rated", "fast", "fastest", "cheap", "cheapest", "deal", "delivery", "buy", "find", "need", "want", "please", "naira"
]);

const accessoryRejectTerms = [
  "case", "cover", "sleeve", "skin", "protector", "keyboard cover", "screen guard", "screen protector", "bag", "pouch", "shell", "holder", "stand", "dock", "charger", "charging case", "charging cable", "cable", "adapter", "replacement", "spare", "accessory", "strap", "mount", "remote cover", "travel case"
];

const miniatureRejectTerms = [
  "mini", "tiny", "pocket", "handheld", "desktop", "desk", "usb", "humidifier", "fan", "toy", "figurine", "model", "ornament", "portable ac fan", "air cooler", "mini cooler"
];

const explicitAccessoryIntentTerms = [
  "case", "cover", "sleeve", "skin", "protector", "keyboard cover", "screen guard", "screen protector", "bag", "pouch", "shell", "accessory", "charger", "cable", "adapter", "replacement", "spare", "strap", "mount", "stand", "dock"
];

const explicitMiniatureIntentTerms = [
  "mini", "tiny", "pocket", "handheld", "usb", "desktop", "desk", "portable", "travel"
];

const largeApplianceTerms = [
  "air conditioner", "ac", "refrigerator", "fridge", "freezer", "washing machine", "microwave", "television", "tv"
];

const conversationalPrefixPatterns = [
  /^(?:please\s+)?(?:get|find|show|buy|search(?:\s+for)?|look(?:ing)?\s+for)\s+(?:me\s+)?/i,
  /^(?:i\s+)?(?:need|want)\s+/i,
  /^(?:can you|could you|help me)\s+/i,
];

const rankingPhrasePatterns = [
  /\bbest deal for\b/gi, /\bbest deal\b/gi, /\bcheapest\b/gi, /\blowest price\b/gi, /\bbest rated\b/gi, /\bhighest rated\b/gi, /\bfastest delivery\b/gi, /\bfast delivery\b/gi, /\bdeliver(?:y)? quickly\b/gi,
  /\bbrand new\b/gi, /\bbrand-new\b/gi
];

const fillerPhrasePatterns = [
  /\bfor me\b/gi, /\bplease\b/gi, /\bright now\b/gi, /\btoday\b/gi, /\bavailable\b/gi, /\bin nigeria\b/gi, /\bnear me\b/gi,
  /\bwith delivery this week\b/gi, /\bwith delivery\b/gi, /\bdelivery this week\b/gi, /\bthis week\b/gi,
  /\bbrand new\b/gi, /\bbrand-new\b/gi,
  /\bwith\b/gi, /\band\b/gi, /\bor\b/gi
];

export function tokenize(text: string) {
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
  return tokenize(intent.query);
}

export function isRelevantMerchantText(intent: SearchIntent, text: string) {
  const haystack = text.toLowerCase();

  if (hasAccessoryMismatch(intent, haystack)) {
    return false;
  }

  if (hasMiniatureMismatch(intent, haystack)) {
    return false;
  }

  return hasStrongCustomIntentMatch(intent, haystack);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
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
