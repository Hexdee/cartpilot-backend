import {
  buildOfferId,
  detectBudget,
  detectColor,
  detectProductKey,
  detectRankingMode,
  extractSearchQuery,
  formatCurrency,
  getProductEntry,
  getDefaultMerchantEta,
  getDefaultMerchantShipping,
  parseMoney,
  parseRating,
} from "@/domain/catalog";
import { AiProvider } from "@/services/ai/ai-provider";
import {
  MerchantOfferSnapshot,
  MerchantRawOffer,
  Order,
  SearchIntent,
  TrackingEvent,
} from "@/domain/types";

export class HeuristicAiProvider implements AiProvider {
  async parseSearchIntent(message: string, _conversationContext?: string[]): Promise<SearchIntent> {
    const query = extractSearchQuery(message);
    return {
      query,
      productKey: detectProductKey(query),
      rankingMode: detectRankingMode(message),
      budget: detectBudget(message),
      color: detectColor(message),
    };
  }

  async generateClarifyingQuestion(searchIntent: SearchIntent): Promise<string | null> {
    if (searchIntent.query.trim().length < 6) {
      return "Can you share the exact product name or a little more detail so I can search accurately?";
    }

    return getProductEntry(searchIntent.productKey).followUp;
  }

  async normalizeMerchantOffers(
    searchIntent: SearchIntent,
    rawOffers: MerchantRawOffer[],
  ): Promise<MerchantOfferSnapshot[]> {
    return rawOffers
      .map((offer) => this.normalizeRawOffer(searchIntent, offer))
      .filter((offer): offer is MerchantOfferSnapshot => Boolean(offer));
  }

  async explainRanking(
    searchIntent: SearchIntent,
    rankedOffers: MerchantOfferSnapshot[],
  ): Promise<string> {
    const [topOffer, nextOffer] = rankedOffers;

    if (!topOffer) {
      return "No supported merchant has a matching offer for the current request yet.";
    }

    if (!nextOffer) {
      return `${topOffer.merchant} is the only strong match after applying the current constraints.`;
    }

    switch (searchIntent.rankingMode) {
      case "fastest_delivery":
        return `${topOffer.merchant} ranks first because it arrives faster than ${nextOffer.merchant} while keeping the total cost competitive.`;
      case "lowest_total_price":
        return `${topOffer.merchant} is the best deal because its delivered total of ${formatCurrency(topOffer.totalCost)} is lower than the next option.`;
      case "highest_rating":
        return `${topOffer.merchant} leads on customer rating and still avoids a major delivery or price penalty.`;
      case "balanced":
        return `${topOffer.merchant} offers the strongest overall tradeoff between delivery speed, cost, and buyer rating.`;
    }
  }

  async summarizeOrderStatus(order: Order, trackingEvents: TrackingEvent[]): Promise<string> {
    const latestEvent = trackingEvents[trackingEvents.length - 1];

    if (!latestEvent) {
      return `Order ${order.publicOrderId} is active and awaiting the next fulfillment update.`;
    }

    return `Order ${order.publicOrderId} is currently ${order.status.replace(/_/g, " ")}. Latest update: ${latestEvent.detail}`;
  }

  private normalizeRawOffer(
    searchIntent: SearchIntent,
    rawOffer: MerchantRawOffer,
  ): MerchantOfferSnapshot | null {
    const title = rawOffer.title.trim();
    if (!title) return null;

    const price = rawOffer.price ?? parseMoney(rawOffer.priceText ?? "");
    if (!price) return null;

    const shippingCost =
      rawOffer.shippingCost
      ?? (parseMoney(rawOffer.shippingText ?? "") || getDefaultMerchantShipping(rawOffer.merchant));
    const eta = getDefaultMerchantEta(rawOffer.merchant);
    const etaHours = rawOffer.etaHours ?? eta.hours;
    const rating = rawOffer.rating ?? parseRating(rawOffer.ratingText) ?? 4.4;
    const sourceUrl = rawOffer.sourceUrl;
    const stableId =
      rawOffer.id
      || buildOfferId(rawOffer.merchant, title, sourceUrl);

    return {
      id: stableId,
      merchant: rawOffer.merchant,
      merchantCategory: "live",
      title,
      summary:
        rawOffer.summary
        || `Live merchant result for ${getProductEntry(searchIntent.productKey).displayName}.`,
      sourceUrl,
      imageUrl: rawOffer.imageUrl,
      productKey: searchIntent.productKey,
      price,
      shippingCost,
      totalCost: price + shippingCost,
      rating,
      etaHours,
      etaLabel: rawOffer.etaText || eta.label,
      availability: rawOffer.availabilityText || "Check merchant listing",
      officialStore:
        rawOffer.officialStore
        ?? /official/i.test(`${rawOffer.sellerName ?? ""} ${rawOffer.summary ?? ""} ${title}`),
      color: rawOffer.color ?? detectColor(title) ?? undefined,
    };
  }
}
