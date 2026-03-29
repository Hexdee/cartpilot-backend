import { load } from "cheerio";
import { MerchantRawOffer, MerchantSearchRequest } from "@/domain/types";
import { LiveMerchantAdapter, LiveMerchantAdapterConfig } from "@/services/search/live-merchant-adapter";

export class KongaMerchantAdapter extends LiveMerchantAdapter {
  constructor(
    private readonly baseUrl: string,
    config: Omit<LiveMerchantAdapterConfig, "merchant">,
  ) {
    super({
      ...config,
      merchant: "Konga",
    });
  }

  protected buildSearchUrl(request: MerchantSearchRequest) {
    const url = new URL(this.baseUrl);
    url.searchParams.set("search", request.query);
    return url.toString();
  }

  protected parseSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    _request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    const offers: MerchantRawOffer[] = [];
    const seenUrls = new Set<string>();

    $("a[href]").each((_, element) => {
      const anchor = $(element);
      const href = this.normalizeHref(anchor.attr("href"), searchUrl);
      if (seenUrls.has(href)) return;

      const container = anchor.closest("article, li, div");
      const title =
        anchor.attr("title")?.trim()
        || anchor.find("h2,h3,h4").first().text().trim()
        || container.find("h2,h3,h4").first().text().trim()
        || "";
      const textBlob = container.text().replace(/\s+/g, " ").trim();
      const priceText =
        container
          .find("*")
          .toArray()
          .map((node) => $(node).text().trim())
          .find((text) => /₦|NGN/i.test(text) && /\d/.test(text))
        || "";
      const imageUrl =
        container.find("img").first().attr("src")
        || container.find("img").first().attr("data-src")
        || undefined;

      if (!title || !priceText || title.length < 6 || !/\/product\//i.test(href)) {
        return;
      }

      seenUrls.add(href);

      offers.push(
        this.createRawOffer({
          sourceUrl: href,
          title,
          priceText,
          summary: textBlob.slice(0, 220),
          imageUrl,
          officialStore: /official|konga/i.test(textBlob),
          raw: {
            parser: "konga:generic-anchor",
          },
        }),
      );
    });

    return offers;
  }
}
