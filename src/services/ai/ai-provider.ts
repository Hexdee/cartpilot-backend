import {
  MerchantOfferSnapshot,
  MerchantRawOffer,
  Order,
  SearchIntent,
  TrackingEvent,
} from "@/domain/types";

export interface AiProvider {
  parseSearchIntent(message: string, conversationContext: string[]): Promise<SearchIntent>;
  generateClarifyingQuestion(searchIntent: SearchIntent): Promise<string | null>;
  normalizeMerchantOffers(
    searchIntent: SearchIntent,
    rawOffers: MerchantRawOffer[],
  ): Promise<MerchantOfferSnapshot[]>;
  explainRanking(
    searchIntent: SearchIntent,
    rankedOffers: MerchantOfferSnapshot[],
  ): Promise<string>;
  summarizeOrderStatus(order: Order, trackingEvents: TrackingEvent[]): Promise<string>;
  formatSearchRequest(query: string): Promise<string>;
}
