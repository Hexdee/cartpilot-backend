import { load } from "cheerio";
import { MerchantRawOffer, MerchantSearchRequest } from "@/domain/types";
import { scrapeRenderedAnchors } from "@/services/search/search-browser";
import { LiveMerchantAdapter, LiveMerchantAdapterConfig } from "@/services/search/live-merchant-adapter";

function collectJsonCandidates(value: unknown, collector: Array<Record<string, unknown>>) {
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonCandidates(entry, collector);
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : typeof record.url_key === "string" ? record.url_key : null;
  const name = typeof record.name === "string" ? record.name : null;
  const price =
    typeof record.price === "number"
      ? String(record.price)
      : typeof record.price === "string"
        ? record.price
        : typeof record.special_price === "number"
          ? String(record.special_price)
          : typeof record.special_price === "string"
            ? record.special_price
            : null;

  if (url && name && price && /\/product\//i.test(url)) {
    collector.push(record);
  }

  for (const nested of Object.values(record)) {
    collectJsonCandidates(nested, collector);
  }
}

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
    const jsonOffers = this.parseNextDataOffers($, searchUrl);
    if (jsonOffers.length > 0) {
      return jsonOffers;
    }

    const offers: MerchantRawOffer[] = [];
    const seenUrls = new Set<string>();

    $("a[href], [data-testid*='product'] a[href], [class*='product-card'] a[href]").each((_, element) => {
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
        || container.find("img").first().attr("data-lazy-src")
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

  protected getBrowserAutomationSelector() {
    return "a[href*='/product/'], [data-testid*='product'] a[href], [class*='product-card'] a[href]";
  }

  protected parseBrowserSearchDocument(
    $: ReturnType<typeof load>,
    searchUrl: string,
    request: MerchantSearchRequest,
  ): MerchantRawOffer[] {
    return this.parseSearchDocument($, searchUrl, request);
  }

  protected async searchWithBrowserAutomation(searchUrl: string) {
    const anchors = await scrapeRenderedAnchors(searchUrl, {
      timeoutMs: this.browserTimeoutMs,
      userAgent: this.userAgent,
      waitForSelector: "a[href*='/product/']",
      selector: "a[href]",
      limit: 1500,
    });

    return anchors
      .map((anchor) => {
        const href = this.normalizeHref(anchor.href, searchUrl);
        if (!/\/product\//i.test(href)) {
          return null;
        }

        const textBlob = anchor.text.replace(/\s+/g, " ").trim();
        const priceMatch = textBlob.match(/₦\s?[\d,]+(?:\.\d+)?/i);
        const title = (anchor.title || textBlob.replace(/₦\s?[\d,]+(?:\.\d+)?[\s\S]*$/i, "").trim()).trim();

        if (!title || !priceMatch?.[0]) {
          return null;
        }

        return this.createRawOffer({
          sourceUrl: href,
          title,
          priceText: priceMatch[0],
          imageUrl: anchor.imageUrl || undefined,
          summary: textBlob.slice(0, 220),
          raw: {
            parser: "konga:browser-dom",
          },
        });
      })
      .filter((offer): offer is MerchantRawOffer => Boolean(offer));
  }

  private parseNextDataOffers($: ReturnType<typeof load>, searchUrl: string) {
    const script = $("#__NEXT_DATA__").html();
    if (!script) return [];

    try {
      const payload = JSON.parse(script) as Record<string, unknown>;
      const candidates: Array<Record<string, unknown>> = [];
      collectJsonCandidates(payload, candidates);

      return candidates.map((entry) => {
        const sourceUrl = this.normalizeHref(
          typeof entry.url === "string" ? entry.url : typeof entry.url_key === "string" ? entry.url_key : searchUrl,
          searchUrl,
        );
        const imageUrl =
          typeof entry.image === "string"
            ? entry.image
            : typeof entry.small_image === "string"
              ? entry.small_image
              : undefined;
        const title = String(entry.name ?? "").trim();
        const priceText = String(entry.special_price ?? entry.price ?? "").trim();
        const sellerName =
          typeof entry.seller_name === "string"
            ? entry.seller_name
            : typeof entry.brand === "string"
              ? entry.brand
              : undefined;

        return this.createRawOffer({
          sourceUrl,
          title,
          priceText,
          imageUrl,
          sellerName,
          summary: typeof entry.description === "string" ? entry.description.slice(0, 220) : undefined,
          officialStore: /official|konga/i.test(`${sellerName ?? ""} ${title}`),
          raw: {
            parser: "konga:__NEXT_DATA__",
          },
        });
      });
    } catch {
      return [];
    }
  }
}
