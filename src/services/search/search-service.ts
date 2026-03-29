import { isRelevantMerchantText, rankOffers } from "@/domain/catalog";
import { SearchIntent, SearchResult } from "@/domain/types";
import { AiProvider } from "@/services/ai/ai-provider";
import { MerchantAdapter } from "@/services/search/merchant-adapter";

export class SearchService {
  constructor(
    private readonly aiProvider: AiProvider,
    private readonly merchantAdapters: MerchantAdapter[],
  ) {}

  async search(intent: SearchIntent): Promise<SearchResult> {
    const adapterResults = await Promise.all(
      this.merchantAdapters.map((adapter) =>
        adapter.searchProducts({
          query: intent.query,
          productKey: intent.productKey,
          budget: intent.budget,
          color: intent.color,
        }),
      ),
    );
    const rawOffers = adapterResults.flatMap((result) => result.offers);
    const filteredRawOffers = rawOffers.filter((offer) =>
      isRelevantMerchantText(
        intent,
        `${offer.title} ${offer.summary ?? ""} ${offer.sourceUrl} ${offer.sellerName ?? ""}`,
      ),
    );
    const normalizationInput = filteredRawOffers.length > 0 ? filteredRawOffers : rawOffers;
    const normalizedOffers = await this.aiProvider.normalizeMerchantOffers(intent, normalizationInput);
    const relevantNormalizedOffers = normalizedOffers.filter((offer) =>
      isRelevantMerchantText(intent, `${offer.title} ${offer.summary} ${offer.sourceUrl}`),
    );

    const rankedOffers = rankOffers(
      intent,
      relevantNormalizedOffers.length > 0 ? relevantNormalizedOffers : normalizedOffers,
    );
    const explanation = await this.aiProvider.explainRanking(intent, rankedOffers);

    return {
      intent,
      offers: rankedOffers,
      explanation,
      sources: adapterResults.map((result) => ({
        merchant: result.merchant,
        mode: result.mode,
        resultCount: result.offers.length,
        warnings: result.warnings,
        searchUrl: result.searchUrl,
      })),
    };
  }
}
