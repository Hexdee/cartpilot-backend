import { isRelevantMerchantText, rankOffers } from "@/domain/catalog";
import { SearchIntent, SearchResult } from "@/domain/types";
import { logger } from "@/lib/logger";
import { AiProvider } from "@/services/ai/ai-provider";
import { MerchantAdapter } from "@/services/search/merchant-adapter";

function countByMerchant<T extends { merchant: string }>(items: T[]) {
  return items.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.merchant] = (accumulator[item.merchant] ?? 0) + 1;
    return accumulator;
  }, {});
}

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
    const filteredCounts = countByMerchant(filteredRawOffers);
    const normalizedCounts = countByMerchant(normalizedOffers);
    const relevantCounts = countByMerchant(relevantNormalizedOffers);
    const finalCounts = countByMerchant(rankedOffers);
    const sources = adapterResults.map((result) => ({
      merchant: result.merchant,
      mode: result.mode,
      resultCount: result.offers.length,
      filteredResultCount: filteredCounts[result.merchant] ?? 0,
      normalizedResultCount: normalizedCounts[result.merchant] ?? 0,
      relevantResultCount: relevantCounts[result.merchant] ?? 0,
      finalResultCount: finalCounts[result.merchant] ?? 0,
      warnings: result.warnings,
      searchUrl: result.searchUrl,
    }));

    logger.info(
      {
        query: intent.query,
        rankingMode: intent.rankingMode,
        merchantDiagnostics: sources,
      },
      "Merchant search diagnostics",
    );

    return {
      intent,
      offers: rankedOffers,
      explanation,
      sources,
    };
  }
}
