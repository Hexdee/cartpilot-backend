import { createId } from "@/lib/ids";
import { formatCurrency } from "@/domain/catalog";
import { Store } from "@/store/store";
import { AiProvider } from "@/services/ai/ai-provider";
import { SearchService } from "@/services/search/search-service";
import { ChannelReplyService } from "@/services/channels/channel-reply-service";
import { OutboundMessageService } from "@/services/channels/outbound-message-service";
import { ChannelType, RankingMode, SearchIntent, SearchSession } from "@/domain/types";
import { DeepLinkService } from "@/services/auth/deep-link-service";

export class ConversationService {
  constructor(
    private readonly store: Store,
    private readonly aiProvider: AiProvider,
    private readonly searchService: SearchService,
    private readonly channelReplyService: ChannelReplyService,
    private readonly outboundMessageService: OutboundMessageService,
    private readonly deepLinkService: DeepLinkService,
  ) {}

  async handleInboundMessage(input: {
    channel: ChannelType;
    externalUserId: string;
    message: string;
    displayName?: string;
  }) {
    const conversationSession = await this.store.getOrCreateConversationSession(
      input.channel,
      input.externalUserId,
      input.displayName,
    );

    const command = this.parseCommand(input.message);
    if (command) {
      return this.handleCommand({
        ...input,
        conversationSessionId: conversationSession.id,
        command,
      });
    }

    if (input.channel === "whatsapp" && this.isWhatsAppGreeting(input.message)) {
      return this.sendWhatsAppWelcome(input.externalUserId);
    }

    return this.runSearchFlow({
      ...input,
      conversationSessionId: conversationSession.id,
      message: input.message,
    });
  }

  private async handleCommand(input: {
    channel: ChannelType;
    externalUserId: string;
    displayName?: string;
    conversationSessionId: string;
    command: { name: string; args: string };
  }) {
    const { name, args } = input.command;

    switch (name) {
      case "start":
        if (input.channel === "whatsapp") {
          return this.sendWhatsAppWelcome(input.externalUserId);
        }

        return this.sendPlainText(
          input.channel,
          input.externalUserId,
          [
            "Welcome to CartPilot Bot, the Telegram assistant for CartPilot.",
            "",
            "CartPilot is a concierge shopping assistant that helps you search across supported stores, compare delivery speed and pricing, choose the offer you want, and continue to checkout or tracking from one place.",
            "",
            "Start here:",
            "/search <product>  Search for a product across supported stores",
            "/track  Check the latest status of your most recent order",
            "/wallet  View your CartPilot wallet balance",
            "",
            "Use /help to see all available commands with examples.",
          ].join("\n"),
        );
      case "help":
        if (input.channel === "whatsapp") {
          return this.sendPlainText(
            input.channel,
            input.externalUserId,
            [
              "CartPilot on WhatsApp",
              "",
              "You can talk to CartPilot naturally on WhatsApp. Tell me what you want to buy, how quickly you need it, or whether you want the best deal, and I will search supported stores for live offers.",
              "",
              "You can ask things like:",
              "Find me an iPhone 14 128GB",
              "I need a fast blender under 120000 naira",
              "Show me the best rated office chair",
              "Track my latest order",
              "What is my wallet balance?",
              "",
              "If you are not sure how to phrase it, just describe the product and what matters most to you.",
            ].join("\n"),
          );
        }

        return this.sendPlainText(
          input.channel,
          input.externalUserId,
          [
            "CartPilot Bot commands",
            "",
            "/search <product>",
            "Search for a product across supported stores and return the best matching offers.",
            "Example: /search Sony WH-1000XM5",
            "",
            "/deal <product>",
            "Search and rank the results by the cheapest delivered total.",
            "Example: /deal air fryer under 150000",
            "",
            "/fast <product>",
            "Search and rank the results by the fastest delivery option.",
            "Example: /fast office chair",
            "",
            "/rated <product>",
            "Search and rank the results by the strongest customer rating.",
            "Example: /rated portable blender",
            "",
            "/more",
            "Show the next set of offers from your latest search.",
            "Example: /more",
            "",
            "/results",
            "Open the latest full comparison page in the web app.",
            "Example: /results",
            "",
            "/track",
            "Show tracking for your latest order.",
            "Example: /track",
            "",
            "/wallet",
            "Show your CartPilot wallet balance and funding network.",
            "Example: /wallet",
            "",
            "You can also send a plain product request without a command, such as: need a fast blender under 120000 naira",
          ].join("\n"),
        );
      case "search":
        if (!args) {
          return this.sendPlainText(
            input.channel,
            input.externalUserId,
            "Usage: /search Sony WH-1000XM5 headphones",
          );
        }

        return this.runSearchFlow({
          ...input,
          message: args,
        });
      case "deal":
      case "fast":
      case "rated":
        if (!args) {
          return this.sendPlainText(
            input.channel,
            input.externalUserId,
            `Usage: /${name} <product>`,
          );
        }

        return this.runSearchFlow({
          ...input,
          message: args,
          rankingModeOverride:
            name === "deal"
              ? "lowest_total_price"
              : name === "fast"
                ? "fastest_delivery"
                : "highest_rating",
        });
      case "results": {
        const sessions = await this.store.listSearchSessionsForIdentity(
          input.channel,
          input.externalUserId,
        );
        const latest = sessions[0];

        if (!latest) {
          return this.sendPlainText(
            input.channel,
            input.externalUserId,
            "No recent search yet. Send a product request or use /search <product> first.",
          );
        }

        const reply = this.channelReplyService.buildSearchReply(input.channel, latest);
        await this.outboundMessageService.sendSearchReply(
          input.channel,
          input.externalUserId,
          reply,
        );

        return { reply };
      }
      case "more": {
        const sessions = await this.store.listSearchSessionsForIdentity(
          input.channel,
          input.externalUserId,
        );
        const latest = sessions[0];

        if (!latest) {
          return this.sendPlainText(
            input.channel,
            input.externalUserId,
            "No recent search yet. Send a product request or use /search <product> first.",
          );
        }

        const requestedPage = Number.parseInt(args, 10);
        const page = Number.isFinite(requestedPage) && requestedPage > 1 ? requestedPage : 2;
        return this.sendSearchPage(input.channel, input.externalUserId, latest.id, page);
      }
      case "track": {
        const orders = await this.store.listOrdersForIdentity(input.channel, input.externalUserId);
        const latest = orders[0];

        if (!latest) {
          return this.sendPlainText(
            input.channel,
            input.externalUserId,
            "No active order yet. Once you complete checkout, /track will return your latest order status.",
          );
        }

        const tracking = await this.store.getTrackingEvents(latest.publicOrderId);
        const reply = await this.channelReplyService.buildTrackingReply(latest, tracking);
        await this.outboundMessageService.sendTrackingUpdate(
          input.channel,
          input.externalUserId,
          reply,
        );

        return { reply };
      }
      case "wallet": {
        const wallet = await this.store.getWallet(input.channel, input.externalUserId);
        return this.sendPlainText(
          input.channel,
          input.externalUserId,
          [
            "CartPilot Wallet",
            `${wallet.assetSymbol} on ${wallet.network}`,
            `Available balance: ${formatCurrency(wallet.availableBalance)}`,
            wallet.pendingBalance > 0
              ? `Pending balance: ${formatCurrency(wallet.pendingBalance)}`
              : null,
            `Wallet address: ${wallet.walletAddress}`,
            "",
            "You can fund this wallet and use it during checkout when your balance covers the full order total.",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      default:
        return this.sendPlainText(
          input.channel,
          input.externalUserId,
          "Unknown command. Use /help to see the supported bot commands.",
        );
    }
  }

  async handleTelegramCallback(input: {
    externalUserId: string;
    callbackQueryId: string;
    data: string;
    displayName?: string;
  }) {
    const [action, searchSessionId, rawPage] = input.data.split(":");

    if (action === "more" && searchSessionId) {
      const page = Number.parseInt(rawPage ?? "2", 10);
      const result = await this.sendSearchPage(
        "telegram",
        input.externalUserId,
        searchSessionId,
        Number.isFinite(page) && page > 1 ? page : 2,
      );
      await this.outboundMessageService.answerTelegramCallbackQuery(
        input.callbackQueryId,
        "Loaded more offers.",
      );
      return result;
    }

    if (action === "choose" && searchSessionId && rawPage) {
      const result = await this.handleOfferSelection(
        "telegram",
        input.externalUserId,
        searchSessionId,
        rawPage,
      );
      await this.outboundMessageService.answerTelegramCallbackQuery(
        input.callbackQueryId,
        result ? "Offer selected." : "Offer not found.",
      );
      return result;
    }

    await this.outboundMessageService.answerTelegramCallbackQuery(
      input.callbackQueryId,
      "That action is not supported yet.",
    );
    return null;
  }

  async handleChannelAction(input: {
    channel: Extract<ChannelType, "telegram" | "whatsapp">;
    externalUserId: string;
    data: string;
    displayName?: string;
  }) {
    const [action, searchSessionId, rawPage] = input.data.split(":");

    if (input.channel === "telegram") {
      return this.handleTelegramCallback({
        externalUserId: input.externalUserId,
        displayName: input.displayName,
        callbackQueryId: "",
        data: input.data,
      });
    }

    if (action === "welcome_search") {
      return this.sendPlainText(
        "whatsapp",
        input.externalUserId,
        "Tell me what you want to buy. Example: iPhone 14 128GB, fast delivery.",
      );
    }

    if (action === "track") {
      return this.handleCommand({
        channel: "whatsapp",
        externalUserId: input.externalUserId,
        displayName: input.displayName,
        conversationSessionId: (await this.store.getOrCreateConversationSession(
          "whatsapp",
          input.externalUserId,
          input.displayName,
        )).id,
        command: { name: "track", args: "" },
      });
    }

    if (action === "wallet") {
      return this.handleCommand({
        channel: "whatsapp",
        externalUserId: input.externalUserId,
        displayName: input.displayName,
        conversationSessionId: (await this.store.getOrCreateConversationSession(
          "whatsapp",
          input.externalUserId,
          input.displayName,
        )).id,
        command: { name: "wallet", args: "" },
      });
    }

    if (action === "more" && searchSessionId) {
      const page = Number.parseInt(rawPage ?? "2", 10);
      return this.sendSearchPage(
        "whatsapp",
        input.externalUserId,
        searchSessionId,
        Number.isFinite(page) && page > 1 ? page : 2,
      );
    }

    if (action === "choose" && searchSessionId && rawPage) {
      return this.handleOfferSelection("whatsapp", input.externalUserId, searchSessionId, rawPage);
    }

    return this.sendPlainText(
      "whatsapp",
      input.externalUserId,
      "That action is not supported yet. Send /help to see what you can do.",
    );
  }

  private async runSearchFlow(input: {
    channel: ChannelType;
    externalUserId: string;
    displayName?: string;
    conversationSessionId: string;
    message: string;
    rankingModeOverride?: RankingMode;
  }) {
    const parsed = await this.aiProvider.parseSearchIntent(input.message, [input.message]);
    const intent: SearchIntent = input.rankingModeOverride
      ? { ...parsed, rankingMode: input.rankingModeOverride }
      : parsed;
    const result = await this.searchService.search(intent);
    const searchSession: SearchSession = {
      id: createId("search"),
      conversationSessionId: input.conversationSessionId,
      channel: input.channel,
      intent,
      offers: result.offers,
      explanation: result.explanation,
      createdAt: new Date().toISOString(),
    };

    await this.store.createSearchSession(searchSession);
    const reply = this.channelReplyService.buildSearchReply(input.channel, searchSession);
    if (!result.offers.length && result.sources?.length) {
      const diagnostics = result.sources
        .map((source) => {
          const warningText = source.warnings?.length ? `; ${source.warnings.join(" | ")}` : "";
          return `${source.merchant}: ${source.resultCount} raw, ${source.filteredResultCount ?? 0} matched${warningText}`;
        })
        .join("\n");

      reply.summary = `${reply.summary}\n\nMerchant diagnostics:\n${diagnostics}`;
    }
    await this.outboundMessageService.sendSearchReply(input.channel, input.externalUserId, reply);

    return {
      searchSession,
      reply,
    };
  }

  private parseCommand(message: string) {
    const normalized = message.trim();
    if (!normalized.startsWith("/")) return null;

    const [rawName, ...rest] = normalized.split(/\s+/);
    const name = rawName.slice(1).split("@")[0]?.toLowerCase();

    if (!name) return null;

    return {
      name,
      args: rest.join(" ").trim(),
    };
  }

  private async sendPlainText(channel: ChannelType, externalUserId: string, text: string) {
    await this.outboundMessageService.sendText(channel, externalUserId, text);
    return {
      reply: {
        summary: text,
        topOffers: [],
        webLinks: {
          results: "",
        },
      },
    };
  }

  private async sendSearchPage(
    channel: ChannelType,
    externalUserId: string,
    searchSessionId: string,
    page: number,
  ) {
    const searchSession = await this.store.getSearchSession(searchSessionId);

    if (!searchSession) {
      return this.sendPlainText(
        channel,
        externalUserId,
        "I could not find that search session anymore. Please run the search again.",
      );
    }

    const reply = this.channelReplyService.buildSearchReply(channel, searchSession, {
      page,
      pageSize: 3,
    });

    if (reply.topOffers.length === 0) {
      return this.sendPlainText(
        channel,
        externalUserId,
        "No more offers in that result set. Use /results to reopen the full comparison page.",
      );
    }

    await this.outboundMessageService.sendSearchReply(channel, externalUserId, reply);
    return { reply, searchSession };
  }

  private async handleOfferSelection(
    channel: Extract<ChannelType, "telegram" | "whatsapp">,
    externalUserId: string,
    searchSessionId: string,
    offerId: string,
  ) {
    const searchSession = await this.store.getSearchSession(searchSessionId);

    if (!searchSession) {
      await this.sendPlainText(
        channel,
        externalUserId,
        "I could not find that search anymore. Please run the search again.",
      );
      return null;
    }

    const offer = searchSession.offers.find((entry) => entry.id === offerId);
    if (!offer) {
      await this.sendPlainText(
        channel,
        externalUserId,
        "That offer is no longer available in this result set.",
      );
      return null;
    }

    const checkoutSessionId = `checkout_${Date.now()}`;
    await this.store.createCheckoutSession({
      id: checkoutSessionId,
      searchSessionId: searchSession.id,
      offerId: offer.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      channel,
      payload: {
        source: `${channel}_offer_selection`,
      },
      createdAt: new Date().toISOString(),
    });

    const wallet = await this.store.getWallet(channel, externalUserId);
    const platformFee = Math.max(3900, Math.round(offer.totalCost * 0.014));
    const checkoutUrl = this.deepLinkService.checkoutLink(checkoutSessionId);
    const walletCheckoutUrl =
      wallet.availableBalance >= offer.totalCost + platformFee
        ? this.deepLinkService.checkoutLinkWithOptions(checkoutSessionId, {
            payment: "wallet",
          })
        : undefined;

    const payload = {
      summary: [
        `Selected: ${offer.merchant}`,
        `${offer.title}`,
        `${formatCurrency(offer.totalCost)} • ${offer.etaLabel} • ${offer.rating.toFixed(1)} rating`,
        "",
        "Choose how you want to continue.",
      ].join("\n"),
      checkoutUrl,
      walletCheckoutUrl,
      resultsUrl: this.deepLinkService.resultsLink(searchSession),
    };

    if (channel === "telegram") {
      await this.outboundMessageService.sendTelegramOfferSelection(externalUserId, payload);
    } else {
      await this.outboundMessageService.sendWhatsAppOfferSelection(externalUserId, payload);
    }

    return {
      offer,
      checkoutSessionId,
    };
  }

  private async sendWhatsAppWelcome(externalUserId: string) {
    const text = [
      "Welcome to CartPilot on WhatsApp.",
      "",
      "CartPilot is a concierge shopping assistant that helps you search supported stores, compare live offers, choose the product you want, and continue to checkout or tracking from one place.",
      "",
      "You can talk to me naturally here. Tell me what you want to buy, whether you want the best deal, the fastest delivery, or the best rating, and I will help you find it.",
      "",
      "Examples:",
      "I need an iPhone 14 128GB",
      "Find me the best deal for Dr Teal body wash",
      "Track my latest order",
      "",
      "What would you like to shop for today?",
    ].join("\n");

    await this.outboundMessageService.sendWhatsAppWelcome(externalUserId, text);
    return {
      reply: {
        summary: text,
        topOffers: [],
        webLinks: {
          results: "",
        },
      },
    };
  }

  private isWhatsAppGreeting(message: string) {
    const normalized = message
      .trim()
      .toLowerCase()
      .replace(/[!?.;,]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const greetingPhrases = new Set([
      "hello",
      "hi",
      "hey",
      "yo",
      "hola",
      "good morning",
      "good afternoon",
      "good evening",
      "how far",
      "what's up",
      "whats up",
      "sup",
      "help",
      "menu",
      "start",
    ]);

    if (greetingPhrases.has(normalized)) {
      return true;
    }

    const tokens = normalized.split(" ").filter(Boolean);
    if (tokens.length > 4) {
      return false;
    }

    return (
      tokens.length > 0
      && tokens.every((token) =>
        ["hello", "hi", "hey", "yo", "help", "menu", "start", "please"].includes(token)
        || token.startsWith("good"),
      )
    );
  }
}
