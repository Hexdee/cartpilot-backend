import { load } from "cheerio";
import {
  buildOfferId,
  getOfferSeed,
  seedSnapshotToRawOffer,
} from "@/domain/catalog";
import {
  MerchantRawOffer,
  MerchantSearchMode,
  MerchantSearchRequest,
  ProductKey,
} from "@/domain/types";
import { MerchantAdapter, MerchantSearchResponse } from "@/services/search/merchant-adapter";

export type LiveMerchantAdapterConfig = {
  merchant: string;
  mode: MerchantSearchMode;
  timeoutMs: number;
  userAgent: string;
};

export abstract class LiveMerchantAdapter implements MerchantAdapter {
  readonly merchant: string;
  readonly mode: MerchantSearchMode;
  protected readonly timeoutMs: number;
  protected readonly userAgent: string;

  constructor(config: LiveMerchantAdapterConfig) {
    this.merchant = config.merchant;
    this.mode = config.mode;
    this.timeoutMs = config.timeoutMs;
    this.userAgent = config.userAgent;
  }

  async searchProducts(request: MerchantSearchRequest): Promise<MerchantSearchResponse> {
    if (this.mode === "seed") {
      return this.createSeedResponse(request);
    }

    const searchUrl = this.buildSearchUrl(request);
    const warnings: string[] = [];

    try {
      const response = await fetch(searchUrl, {
        headers: {
          "user-agent": this.userAgent,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-NG,en;q=0.9",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`${this.merchant} search returned HTTP ${response.status}`);
      }

      const html = await response.text();
      const offers = this.parseHtml(html, searchUrl, request);

      if (offers.length > 0 || this.mode === "live") {
        return {
          merchant: this.merchant,
          mode: "live",
          query: request.query,
          offers,
          warnings: warnings.length ? warnings : undefined,
          searchUrl,
        };
      }

      warnings.push(`No live ${this.merchant} offers were parsed. Falling back to seeded catalog.`);
      const seed = this.createSeedResponse(request);
      return {
        ...seed,
        mode: "hybrid",
        warnings,
        searchUrl,
      };
    } catch (error) {
      if (this.mode === "hybrid") {
        const seed = this.createSeedResponse(request);
        return {
          ...seed,
          mode: "hybrid",
          warnings: [
            error instanceof Error
              ? `Live ${this.merchant} search failed: ${error.message}`
              : `Live ${this.merchant} search failed.`,
          ],
          searchUrl,
        };
      }

      return {
        merchant: this.merchant,
        mode: "live",
        query: request.query,
        offers: [],
        warnings: [
          error instanceof Error
            ? `Live ${this.merchant} search failed: ${error.message}`
            : `Live ${this.merchant} search failed.`,
        ],
        searchUrl,
      };
    }
  }

  async getOfferDetails(offerId: string) {
    const offer = this.listSeedSnapshots().find((entry) => entry.id === offerId);
    return offer ?? null;
  }

  async checkAvailability(offerId: string, destination: string) {
    const details = await this.getOfferDetails(offerId);
    return {
      available: Boolean(details),
      detail: details
        ? `Offer is available for delivery to ${destination}.`
        : "Offer availability needs to be confirmed on the merchant listing.",
    };
  }

  protected abstract buildSearchUrl(request: MerchantSearchRequest): string;
  protected abstract parseSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    request: MerchantSearchRequest,
  ): MerchantRawOffer[];

  protected createSeedResponse(request: MerchantSearchRequest): MerchantSearchResponse {
    return {
      merchant: this.merchant,
      mode: "seed",
      query: request.query,
      offers: getOfferSeed(request.productKey)
        .filter((offer) => offer.merchant === this.merchant)
        .map(seedSnapshotToRawOffer),
    };
  }

  protected normalizeHref(href: string | undefined, fallbackBaseUrl: string) {
    if (!href) return fallbackBaseUrl;
    try {
      return new URL(href, fallbackBaseUrl).toString();
    } catch {
      return fallbackBaseUrl;
    }
  }

  protected createRawOffer(input: {
    merchant?: string;
    sourceUrl: string;
    title: string;
    summary?: string;
    imageUrl?: string;
    priceText?: string;
    shippingText?: string;
    ratingText?: string;
    availabilityText?: string;
    etaText?: string;
    officialStore?: boolean;
    sellerName?: string;
    color?: string | null;
    raw?: Record<string, unknown>;
  }): MerchantRawOffer {
    return {
      id: buildOfferId(input.merchant ?? this.merchant, input.title, input.sourceUrl),
      merchant: input.merchant ?? this.merchant,
      sourceUrl: input.sourceUrl,
      title: input.title.trim(),
      summary: input.summary?.trim() || undefined,
      imageUrl: input.imageUrl,
      priceText: input.priceText?.trim(),
      shippingText: input.shippingText?.trim(),
      ratingText: input.ratingText?.trim(),
      availabilityText: input.availabilityText?.trim(),
      etaText: input.etaText?.trim(),
      officialStore: input.officialStore,
      sellerName: input.sellerName?.trim(),
      color: input.color ?? null,
      raw: input.raw,
    };
  }

  protected parseHtml(
    html: string,
    searchUrl: string,
    request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    const $ = load(html);
    const offers = this.parseSearchDocument($, searchUrl, request);
    const unique = new Map<string, MerchantRawOffer>();

    for (const offer of offers) {
      if (!offer.title || !offer.sourceUrl) continue;
      if (!unique.has(offer.id)) {
        unique.set(offer.id, offer);
      }
    }

    return [...unique.values()];
  }

  private listSeedSnapshots() {
    const keys: ProductKey[] = [
      "sony_wh1000xm5",
      "office_chair",
      "portable_blender",
      "ps5_controller",
      "air_fryer",
    ];

    return keys.flatMap((key) =>
      getOfferSeed(key).filter((offer) => offer.merchant === this.merchant),
    );
  }
}
