import { AssistantReply, ChannelType, Order, SearchSession, TrackingEvent } from "@/domain/types";
import { formatCurrency } from "@/domain/catalog";
import { DeepLinkService } from "@/services/auth/deep-link-service";
import { AiProvider } from "@/services/ai/ai-provider";

export class ChannelReplyService {
  constructor(
    private readonly deepLinkService: DeepLinkService,
    private readonly aiProvider: AiProvider,
  ) {}

  buildSearchReply(
    channel: ChannelType,
    searchSession: SearchSession,
    options?: { page?: number; pageSize?: number },
  ): AssistantReply {
    const pageSize = options?.pageSize ?? 3;
    const page = Math.max(options?.page ?? 1, 1);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const topOffers = searchSession.offers.slice(start, end).map((offer) => ({
      id: offer.id,
      merchant: offer.merchant,
      title: offer.title,
      summary: offer.summary,
      sourceUrl: offer.sourceUrl,
      imageUrl: offer.imageUrl,
      totalCost: offer.totalCost,
      etaLabel: offer.etaLabel,
      rating: offer.rating,
    }));
    const checkoutUrl = searchSession.offers[0]
      ? this.deepLinkService.checkoutLink(`${searchSession.id}:${searchSession.offers[0].id}`)
      : undefined;
    const hasOffers = searchSession.offers.length > 0;
    const emptySummary = [
      `I couldn't find a confident live match for "${searchSession.intent.query}" across supported merchants yet.`,
      "Try adding a clearer brand, model, size, or product type.",
    ].join(" ");

    return {
      summary:
        channel === "web"
          ? searchSession.explanation
          : page === 1
            ? hasOffers
              ? `${searchSession.explanation} Top offer: ${searchSession.offers[0].merchant} at ${formatCurrency(searchSession.offers[0].totalCost)}.`
              : emptySummary
            : `Showing more offers for "${searchSession.intent.query}".`,
      searchSessionId: searchSession.id,
      page,
      pageSize,
      totalOffers: searchSession.offers.length,
      hasMore: end < searchSession.offers.length,
      clarifyingQuestion: undefined,
      topOffers,
      webLinks: {
        results: this.deepLinkService.resultsLink(searchSession),
        checkout: checkoutUrl,
      },
    };
  }

  async buildTrackingReply(order: Order, trackingEvents: TrackingEvent[]) {
    const summary = await this.aiProvider.summarizeOrderStatus(order, trackingEvents);
    return {
      summary,
      trackingUrl: this.deepLinkService.trackingLink(order),
    };
  }
}
