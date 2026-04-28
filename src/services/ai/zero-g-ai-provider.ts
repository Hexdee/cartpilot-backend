import { z } from "zod";
import { AiProvider } from "@/services/ai/ai-provider";
import { HeuristicAiProvider } from "@/services/ai/heuristic-ai-provider";
import { ZeroGComputeClient } from "@/services/ai/zero-g-compute-client";
import {
  MerchantOfferSnapshot,
  MerchantRawOffer,
  Order,
  SearchIntent,
  TrackingEvent,
} from "@/domain/types";
import { logger } from "@/lib/logger";

const searchIntentSchema = z.object({
  query: z.string().min(1),
  productKey: z.enum([
    "custom",
    "sony_wh1000xm5",
    "office_chair",
    "portable_blender",
    "ps5_controller",
    "air_fryer",
  ]),
  rankingMode: z.enum([
    "fastest_delivery",
    "lowest_total_price",
    "highest_rating",
    "balanced",
  ]),
  budget: z.number().nullable(),
  color: z.string().nullable(),
});

const normalizationSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      normalizedTitle: z.string().optional(),
      summary: z.string().optional(),
      officialStore: z.boolean().optional(),
      color: z.string().nullable().optional(),
      relevance: z.number().min(0).max(1).optional(),
    }),
  ),
});

export class ZeroGAiProvider implements AiProvider {
  private readonly fallback = new HeuristicAiProvider();
  private readonly computeClient = new ZeroGComputeClient();

  async parseSearchIntent(message: string, conversationContext: string[]): Promise<SearchIntent> {
    if (!this.computeClient.isConfigured()) {
      return this.fallback.parseSearchIntent(message, conversationContext);
    }

    try {
      return await this.runJsonTask(
        [
          "Extract a shopping search intent.",
          "The query field must be a concise merchant-search phrase, not the full user sentence.",
          "Use one allowed product key and one allowed ranking mode.",
          "Use custom when the request is not one of the predefined catalog products.",
          "Return strict JSON only.",
          "If budget or color is missing, return null for that field.",
        ].join(" "),
        `Conversation context: ${conversationContext.join(" | ")}\nMessage: ${message}`,
        searchIntentSchema,
      );
    } catch (error) {
      logger.warn(
        { task: "parseSearchIntent", error: error instanceof Error ? error.message : String(error) },
        "0G parse failed. Falling back to deterministic heuristics.",
      );
      return this.fallback.parseSearchIntent(message, conversationContext);
    }
  }

  async generateClarifyingQuestion(searchIntent: SearchIntent): Promise<string | null> {
    return this.fallback.generateClarifyingQuestion(searchIntent);
  }

  async normalizeMerchantOffers(
    searchIntent: SearchIntent,
    rawOffers: MerchantRawOffer[],
  ): Promise<MerchantOfferSnapshot[]> {
    const base = await this.fallback.normalizeMerchantOffers(searchIntent, rawOffers);

    if (!this.computeClient.isConfigured() || base.length === 0) {
      return base;
    }

    try {
      const result = await this.runJsonTask(
        [
          "Normalize ecommerce search results for a shopping assistant.",
          "Keep only results relevant to the requested product.",
          "Reject accessories, protective cases, sleeves, covers, replacement parts, bundles dominated by accessories, and novelty or miniature substitutes unless the user explicitly asked for them.",
          "If the user asked for a core product, do not keep tiny USB, desktop, handheld, toy, or mini variants that are not the main product category.",
          "Return strict JSON only.",
          "Do not invent prices or URLs.",
        ].join(" "),
        JSON.stringify({
          intent: searchIntent,
          offers: base.map((offer) => ({
            id: offer.id,
            merchant: offer.merchant,
            title: offer.title,
            summary: offer.summary,
            sourceUrl: offer.sourceUrl,
            officialStore: offer.officialStore,
            color: offer.color ?? null,
          })),
        }),
        normalizationSchema,
      );

      const overrides = new Map(result.results.map((entry) => [entry.id, entry]));
      return base
        .map((offer) => {
          const override = overrides.get(offer.id);
          if (!override) return offer;
          if (typeof override.relevance === "number" && override.relevance < 0.35) {
            return null;
          }

          return {
            ...offer,
            title: override.normalizedTitle || offer.title,
            summary: override.summary || offer.summary,
            officialStore: override.officialStore ?? offer.officialStore,
            color: override.color ?? offer.color,
          };
        })
        .filter((offer): offer is MerchantOfferSnapshot => Boolean(offer));
    } catch (error) {
      logger.warn(
        { task: "normalizeMerchantOffers", error: error instanceof Error ? error.message : String(error) },
        "0G normalization failed. Falling back to deterministic normalization.",
      );
      return base;
    }
  }

  async explainRanking(
    searchIntent: SearchIntent,
    rankedOffers: MerchantOfferSnapshot[],
  ): Promise<string> {
    return this.fallback.explainRanking(searchIntent, rankedOffers);
  }

  async summarizeOrderStatus(order: Order, trackingEvents: TrackingEvent[]): Promise<string> {
    return this.fallback.summarizeOrderStatus(order, trackingEvents);
  }

  async formatSearchRequest(query: string): Promise<string> {
    if (!this.computeClient.isConfigured()) {
      return this.fallback.formatSearchRequest(query);
    }

    try {
      const completion = await this.computeClient.runChat([
        {
          role: "system",
          content:
            "Format the user's shopping request into a concise search query for an ecommerce site. Remove all conversational filler, adjectives like 'cheapest' or 'fastest', and constraints like 'delivery this week'. Return only the core product name and key specifications.",
        },
        {
          role: "user",
          content: query,
        },
      ]);
      return completion.content.replace(/^["']|["']$/g, "").trim();
    } catch (error) {
      logger.warn(
        { task: "formatSearchRequest", error: error instanceof Error ? error.message : String(error) },
        "0G format failed. Falling back to heuristic.",
      );
      return this.fallback.formatSearchRequest(query);
    }
  }

  private async runJsonTask<T>(
    systemInstruction: string,
    userContent: string,
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    const completion = await this.computeClient.runChat([
      {
        role: "system",
        content: `${systemInstruction} Return valid JSON only.`,
      },
      {
        role: "user",
        content: userContent,
      },
    ]);

    const parsed = this.extractJson(completion.content);
    return schema.parse(parsed);
  }

  private extractJson(content: string) {
    const fenced = content.match(/```json\s*([\s\S]*?)```/i)?.[1];
    const candidate = fenced ?? content;
    const firstBrace = candidate.indexOf("{");
    const firstBracket = candidate.indexOf("[");
    const start =
      firstBrace === -1
        ? firstBracket
        : firstBracket === -1
          ? firstBrace
          : Math.min(firstBrace, firstBracket);

    if (start === -1) {
      throw new Error("0G response did not contain JSON.");
    }

    return JSON.parse(candidate.slice(start));
  }
}
