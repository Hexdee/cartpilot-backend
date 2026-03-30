import { load } from "cheerio";
import { MerchantRawOffer, MerchantSearchRequest } from "@/domain/types";
import { scrapeRenderedAnchors } from "@/services/search/search-browser";
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
    const jsonLdOffers = this.parseJsonLdOffers($, searchUrl);
    if (jsonLdOffers.length > 0) {
      return jsonLdOffers;
    }

    const offers: MerchantRawOffer[] = [];
    const seen = new Set<string>();

    $("a[href*='/item/'], a.search-card-item, a[class*='search-card'], [class*='list--gallery'] a[href]").each((_, element) => {
      const card = $(element);
      const href = this.normalizeHref(card.attr("href"), searchUrl);
      if (seen.has(href)) return;

      const title =
        card.find("img").first().attr("alt")?.trim()
        || card.find("h1,h2,h3,h4").first().text().trim()
        || card.text().replace(/\s+/g, " ").trim().slice(0, 180)
        || "";
      const priceText =
        card.find("*")
          .toArray()
          .map((node) => $(node).text().trim())
          .find((text) => /[$€£₦]|US\s?[$]/i.test(text) && /\d/.test(text))
        || card.text().replace(/\s+/g, " ").trim().match(/(?:NGN|₦|US\s?\$|\$)\s?[\d,]+(?:\.\d+)?/)?.[0]
        || "";
      const imageUrl =
        card.find("img").first().attr("src")
        || card.find("img").first().attr("data-src")
        || card.find("img").first().attr("data-lazy-src")
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

  protected getBrowserAutomationSelector() {
    return "a[href*='/item/'], a.search-card-item, a[class*='search-card'], [class*='manhattan--container'] a[href]";
  }

  protected parseBrowserSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    _request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    const offers: MerchantRawOffer[] = [];
    const seen = new Set<string>();

    $("a[href]").each((_, element) => {
      const card = $(element);
      const href = this.normalizeHref(card.attr("href"), searchUrl);
      if (seen.has(href) || !/\/item\//i.test(href)) {
        return;
      }

      const textBlob = card.text().replace(/\s+/g, " ").trim();
      const priceMatch = textBlob.match(/(?:NGN|₦|US\s?\$|\$)\s?[\d,]+(?:\.\d+)?/i);
      const titleFromImage = card.find("img").first().attr("alt")?.trim();
      const title =
        titleFromImage
        || textBlob.replace(/(?:NGN|₦|US\s?\$|\$)\s?[\d,]+(?:\.\d+)?[\s\S]*$/i, "").trim();
      const imageUrl =
        card.find("img").first().attr("src")
        || card.find("img").first().attr("data-src")
        || card.find("img").first().attr("data-lazy-src")
        || undefined;

      if (!title || !priceMatch?.[0]) {
        return;
      }

      seen.add(href);
      offers.push(
        this.createRawOffer({
          sourceUrl: href,
          title,
          summary: textBlob.slice(0, 220),
          imageUrl,
          priceText: priceMatch[0],
          availabilityText: "Import listing",
          raw: {
            parser: "aliexpress:browser-dom",
          },
        }),
      );
    });

    return offers;
  }

  protected async searchWithBrowserAutomation(searchUrl: string) {
    const anchors = await scrapeRenderedAnchors(searchUrl, {
      timeoutMs: this.browserTimeoutMs,
      userAgent: this.userAgent,
      waitForSelector: "a[href*='/item/']",
      selector: "a[href]",
      limit: 2000,
    });

    return anchors
      .map((anchor) => {
        const href = this.normalizeHref(anchor.href, searchUrl);
        if (!/\/item\//i.test(href)) {
          return null;
        }

        const textBlob = anchor.text.replace(/\s+/g, " ").trim();
        const priceMatch = textBlob.match(/(?:NGN|₦|US\s?\$|\$)\s?[\d,]+(?:\.\d+)?/i);
        const title = (anchor.title || textBlob.replace(/(?:NGN|₦|US\s?\$|\$)\s?[\d,]+(?:\.\d+)?[\s\S]*$/i, "").trim()).trim();

        if (!title || !priceMatch?.[0]) {
          return null;
        }

        return this.createRawOffer({
          sourceUrl: href,
          title,
          priceText: priceMatch[0],
          imageUrl: anchor.imageUrl || undefined,
          summary: textBlob.slice(0, 220),
          availabilityText: "Import listing",
          raw: {
            parser: "aliexpress:browser-dom-direct",
          },
        });
      })
      .filter((offer): offer is MerchantRawOffer => Boolean(offer));
  }

  private parseJsonLdOffers($: ReturnType<typeof load>, searchUrl: string) {
    const offers: MerchantRawOffer[] = [];

    $("script[type='application/ld+json']").each((_, element) => {
      const raw = $(element).contents().text().trim();
      if (!raw) return;

      try {
        const payload = JSON.parse(raw) as Record<string, unknown> | Array<unknown>;
        this.collectJsonLdOffers(payload, searchUrl, offers);
      } catch {
        return;
      }
    });

    return offers;
  }

  private collectJsonLdOffers(
    payload: Record<string, unknown> | Array<unknown>,
    searchUrl: string,
    offers: MerchantRawOffer[],
  ) {
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        if (entry && typeof entry === "object") {
          this.collectJsonLdOffers(entry as Record<string, unknown>, searchUrl, offers);
        }
      }
      return;
    }

    const type = typeof payload["@type"] === "string" ? String(payload["@type"]) : "";
    if (type === "ItemList" && Array.isArray(payload.itemListElement)) {
      for (const entry of payload.itemListElement) {
        if (entry && typeof entry === "object") {
          this.collectJsonLdOffers(entry as Record<string, unknown>, searchUrl, offers);
        }
      }
      return;
    }

    const candidate =
      type === "ListItem" && payload.item && typeof payload.item === "object"
        ? (payload.item as Record<string, unknown>)
        : payload;

    const candidateType = typeof candidate["@type"] === "string" ? String(candidate["@type"]) : "";
    if (candidateType !== "Product") {
      for (const nested of Object.values(candidate)) {
        if (nested && typeof nested === "object") {
          this.collectJsonLdOffers(nested as Record<string, unknown> | Array<unknown>, searchUrl, offers);
        }
      }
      return;
    }

    const title = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const sourceUrl = this.normalizeHref(
      typeof candidate.url === "string" ? candidate.url : searchUrl,
      searchUrl,
    );
    const image =
      typeof candidate.image === "string"
        ? candidate.image
        : Array.isArray(candidate.image) && typeof candidate.image[0] === "string"
          ? String(candidate.image[0])
          : undefined;
    const offersNode =
      candidate.offers && typeof candidate.offers === "object"
        ? (candidate.offers as Record<string, unknown>)
        : null;
    const priceText =
      typeof offersNode?.price === "string"
        ? offersNode.price
        : typeof offersNode?.lowPrice === "string"
          ? offersNode.lowPrice
          : typeof offersNode?.price === "number"
            ? String(offersNode.price)
            : typeof offersNode?.lowPrice === "number"
              ? String(offersNode.lowPrice)
              : "";

    if (!title || !priceText || sourceUrl === searchUrl) {
      return;
    }

    offers.push(
      this.createRawOffer({
        sourceUrl,
        title,
        imageUrl: image,
        priceText,
        summary: typeof candidate.description === "string" ? candidate.description.slice(0, 220) : undefined,
        availabilityText: "Import listing",
        raw: {
          parser: "aliexpress:jsonld",
        },
      }),
    );
  }
}
