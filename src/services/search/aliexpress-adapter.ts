import { load } from "cheerio";
import { MerchantRawOffer, MerchantSearchRequest } from "@/domain/types";
import { LiveMerchantAdapter, LiveMerchantAdapterConfig } from "@/services/search/live-merchant-adapter";

function slugify(query: string) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class AliExpressMerchantAdapter extends LiveMerchantAdapter {
  constructor(config: Omit<LiveMerchantAdapterConfig, "merchant">) {
    super({
      ...config,
      merchant: "AliExpress",
    });
  }

  protected buildSearchUrl(request: MerchantSearchRequest) {
    const slug = slugify(request.query) || "product";
    return `https://www.aliexpress.com/w/wholesale-${slug}.html?SearchText=${encodeURIComponent(request.query)}`;
  }

  protected parseSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    _request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    const offers: MerchantRawOffer[] = [];
    const seen = new Set<string>();

    $("a[href*='/item/'], a.search-card-item, a[class*='search-card']").each((_, element) => {
      const card = $(element);
      const href = this.normalizeHref(card.attr("href"), searchUrl);
      if (seen.has(href)) return;

      const title =
        card.find("img").first().attr("alt")?.trim()
        || card.find("h1,h2,h3,h4").first().text().trim()
        || "";
      const priceText =
        card.find("*")
          .toArray()
          .map((node) => $(node).text().trim())
          .find((text) => /[$€£₦]|US\s?[$]/i.test(text) && /\d/.test(text))
        || "";
      const imageUrl =
        card.find("img").first().attr("src")
        || card.find("img").first().attr("data-src")
        || undefined;
      const summary = card.text().replace(/\s+/g, " ").trim().slice(0, 220) || undefined;

      if (!title || !priceText || !/\/item\//i.test(href)) {
        return;
      }

      seen.add(href);
      offers.push(
        this.createRawOffer({
          sourceUrl: href,
          title,
          summary,
          imageUrl,
          priceText,
          availabilityText: "Import listing",
          raw: {
            parser: "aliexpress:search-card",
          },
        }),
      );
    });

    return offers;
  }
}
