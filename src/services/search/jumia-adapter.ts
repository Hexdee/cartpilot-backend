import { load } from "cheerio";
import { MerchantRawOffer, MerchantSearchRequest } from "@/domain/types";
import { LiveMerchantAdapter, LiveMerchantAdapterConfig } from "@/services/search/live-merchant-adapter";

export class JumiaMerchantAdapter extends LiveMerchantAdapter {
  constructor(
    private readonly baseUrl: string,
    config: Omit<LiveMerchantAdapterConfig, "merchant">,
  ) {
    super({
      ...config,
      merchant: "Jumia",
    });
  }

  protected buildSearchUrl(request: MerchantSearchRequest) {
    const url = new URL(this.baseUrl);
    url.searchParams.set("q", request.query);
    return url.toString();
  }

  protected parseSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    _request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    const offers: MerchantRawOffer[] = [];

    $("article.prd").each((_, element) => {
      const card = $(element);
      const anchor = card.find("a.core").first();
      const href = this.normalizeHref(anchor.attr("href"), searchUrl);
      const title =
        card.find("h3.name").first().text().trim()
        || anchor.attr("title")?.trim()
        || "";
      const priceText = card.find(".prc").first().text().trim();
      const ratingText =
        card.find(".stars._s").first().attr("aria-label")
        || card.find(".rev").first().text().trim()
        || undefined;
      const availabilityText = card.find(".tag").first().text().trim() || "Check merchant listing";
      const summary = card.find(".s-prc-w").first().text().trim() || undefined;
      const imageUrl =
        card.find("img.img").first().attr("data-src")
        || card.find("img.img").first().attr("src")
        || undefined;
      const officialStore = /official/i.test(card.text());

      if (!title || !priceText) {
        return;
      }

      offers.push(
        this.createRawOffer({
          sourceUrl: href,
          title,
          summary,
          imageUrl,
          priceText,
          ratingText,
          availabilityText,
          officialStore,
          raw: {
            parser: "jumia:article.prd",
          },
        }),
      );
    });

    return offers;
  }
}
