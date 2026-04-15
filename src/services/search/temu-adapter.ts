import { load } from "cheerio";
import { MerchantRawOffer, MerchantSearchRequest } from "@/domain/types";
import { scrapeRenderedAnchors } from "@/services/search/search-browser";
import { LiveMerchantAdapter, LiveMerchantAdapterConfig } from "@/services/search/live-merchant-adapter";

/**
 * TemuMerchantAdapter handles scraping search results from Temu.
 * Since Temu is highly dynamic and anti-bot heavy, it relies primarily
 * on browser automation via Playwright.
 */
export class TemuMerchantAdapter extends LiveMerchantAdapter {
  constructor(
    private readonly baseUrl: string,
    config: Omit<LiveMerchantAdapterConfig, "merchant">,
  ) {
    super({
      ...config,
      merchant: "Temu",
    });
  }

  protected buildSearchUrl(request: MerchantSearchRequest) {
    const url = new URL(this.baseUrl);
    url.searchParams.set("search_key", request.query);
    // Add referral or tracking params if needed
    return url.toString();
  }

  protected parseSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    _request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    const offers: MerchantRawOffer[] = [];
    const seenUrls = new Set<string>();

    // Fallback static parsing if possible, though Temu usually requires JS.
    // Based on Identified selectors: div.goods-container or div[class*='goods-card']
    $("div.goods-container, div[class*='goods-card']").each((_, element) => {
      const card = $(element);
      const anchor = card.find("a").first();
      const href = this.normalizeHref(anchor.attr("href"), searchUrl);
      
      if (!href || seenUrls.has(href)) return;

      const title = card.find("h3, span[class*='title'], a span").first().text().trim();
      const priceText = card.find("div[class*='price'], span[class*='price']").first().text().trim();
      const imageUrl = card.find("img").first().attr("src") || card.find("img").first().attr("data-src");

      if (!title || !priceText) return;

      seenUrls.add(href);
      offers.push(
        this.createRawOffer({
          sourceUrl: href,
          title,
          priceText,
          imageUrl,
          raw: {
            parser: "temu:static-grid",
          },
        })
      );
    });

    return offers;
  }

  protected getBrowserAutomationSelector() {
    // Wait for product containers to appear
    return "div[class*='goods-card'], div.goods-container";
  }

  protected parseBrowserSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    return this.parseSearchDocument($, searchUrl, request);
  }

  protected async searchWithBrowserAutomation(searchUrl: string) {
    // Use the optimized scrapeRenderedAnchors from search-browser.ts
    const anchors = await scrapeRenderedAnchors(searchUrl, {
      timeoutMs: this.browserTimeoutMs,
      userAgent: this.userAgent,
      waitForSelector: this.getBrowserAutomationSelector(),
      selector: "a[href*='goods_id']", // Temu links usually contain goods_id
      limit: 1000,
    });

    const seenUrls = new Set<string>();

    const offers = anchors
      .map((anchor) => {
        const href = this.normalizeHref(anchor.href, searchUrl);
        if (seenUrls.has(href)) {
          return null;
        }

        const textBlob = anchor.text.replace(/\s+/g, " ").trim();
        
        // Temu price pattern varies, but usually includes currency symbol
        const priceMatch = textBlob.match(/[₦$£€¥]\s?[\d,]+(?:\.\d+)?/i);
        const title = anchor.title || textBlob.replace(/[₦$£€¥]\s?[\d,]+(?:\.\d+)?[\s\S]*$/i, "").trim();

        if (!title || !priceMatch?.[0]) {
          return null;
        }

        seenUrls.add(href);

        return this.createRawOffer({
          sourceUrl: href,
          title,
          priceText: priceMatch[0],
          imageUrl: anchor.imageUrl || undefined,
          summary: textBlob.slice(0, 220),
          raw: {
            parser: "temu:browser-dom",
          },
        });
      })
      .filter((offer): offer is MerchantRawOffer => Boolean(offer));

    // Deduplicate by ID just to be absolutely clean
    const unique = new Map<string, MerchantRawOffer>();
    for (const offer of offers) {
      if (!unique.has(offer.id)) {
        unique.set(offer.id, offer);
      }
    }

    return [...unique.values()];
  }
}
