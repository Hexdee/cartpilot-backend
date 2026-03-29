import { load } from "cheerio";
import { MerchantRawOffer, MerchantSearchRequest } from "@/domain/types";
import { LiveMerchantAdapter, LiveMerchantAdapterConfig } from "@/services/search/live-merchant-adapter";

export class JijiMerchantAdapter extends LiveMerchantAdapter {
  constructor(
    private readonly baseUrl: string,
    config: Omit<LiveMerchantAdapterConfig, "merchant">,
  ) {
    super({
      ...config,
      merchant: "Jiji",
    });
  }

  protected buildSearchUrl(request: MerchantSearchRequest) {
    const url = new URL(this.baseUrl);
    url.searchParams.set("query", request.query);
    return url.toString();
  }

  protected parseSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    _request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    const offers: MerchantRawOffer[] = [];

    $("a.qa-advert-list-item").each((_, element) => {
      const card = $(element);
      const href = this.normalizeHref(card.attr("href"), searchUrl);
      const title =
        card.find("div[class*='title']").first().text().trim()
        || card.find("img").first().attr("alt")?.trim()
        || "";
      const priceText = card.find("div[class*='price']").first().text().trim();
      const summary = card.find("div[class*='description']").first().text().trim() || undefined;
      const availabilityText =
        card.find("div[class*='condition']").first().text().trim()
        || "Check seller listing";
      const imageUrl =
        card.find("img").first().attr("src")
        || card.find("source").first().attr("srcset")?.split(/\s+/)[0]
        || undefined;
      const location = card.find("div[class*='region']").first().text().trim();
      const officialStore = /verified|top/i.test(card.text());

      if (!title || !priceText) {
        return;
      }

      offers.push(
        this.createRawOffer({
          sourceUrl: href,
          title,
          summary: [summary, location].filter(Boolean).join(" • ") || undefined,
          imageUrl,
          priceText,
          availabilityText,
          officialStore,
          raw: {
            parser: "jiji:qa-advert-list-item",
          },
        }),
      );
    });

    return offers;
  }
}
