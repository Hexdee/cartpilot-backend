import { env } from "@/config/env";
import { AssistantReply, ChannelType } from "@/domain/types";
import { logger } from "@/lib/logger";

function truncate(text: string, maxLength = 4096) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function compactOfferTitle(title: string, maxLength = 54) {
  return title.length > maxLength ? `${title.slice(0, maxLength - 1)}…` : title;
}

type TelegramInlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
};

function isTelegramSafeUrl(url: string | undefined) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost"
      || host === "127.0.0.1"
      || host === "::1"
      || host.endsWith(".local");

    return !isLocalHost && (parsed.protocol === "https:" || parsed.protocol === "http:");
  } catch {
    return false;
  }
}

function isRemoteMediaUrl(url: string | undefined) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export class OutboundMessageService {
  async sendSearchReply(channel: ChannelType, recipientId: string, reply: AssistantReply) {
    if (channel === "web") return;

    if (channel === "telegram") {
      if (reply.topOffers.length === 0) {
        await this.sendTelegramMessage(recipientId, truncate(reply.summary));
        return;
      }

      const page = reply.page ?? 1;
      const pageSize = reply.pageSize ?? reply.topOffers.length;
      const start = (page - 1) * pageSize + 1;
      const end = Math.min(start + reply.topOffers.length - 1, reply.totalOffers ?? reply.topOffers.length);
      const header = [
        page > 1
          ? `More live offers (${start}-${end}${reply.totalOffers ? ` of ${reply.totalOffers}` : ""})`
          : reply.summary,
        page === 1
          ? `Sending ${reply.topOffers.length} product${reply.topOffers.length === 1 ? "" : "s"} below.`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      await this.sendTelegramMessage(recipientId, truncate(header));

      for (const offer of reply.topOffers) {
        await this.sendTelegramProductCard(recipientId, offer, reply.searchSessionId);
      }

      if (reply.hasMore && reply.searchSessionId) {
        await this.sendTelegramMessage(recipientId, "More live offers are available.", {
          replyMarkup: {
            inline_keyboard: [
              [{ text: "More offers", callback_data: `more:${reply.searchSessionId}:${page + 1}` }],
            ],
          },
        });
      }
      return;
    }

    const lines = [
      reply.summary,
      "",
      ...reply.topOffers.map(
        (offer, index) =>
          `${index + 1}. ${offer.merchant}: ${offer.title} | ${offer.etaLabel} | Rating ${offer.rating.toFixed(1)}`,
      ),
      "",
      `Open full results: ${reply.webLinks.results}`,
      reply.webLinks.checkout ? `Checkout top offer: ${reply.webLinks.checkout}` : null,
    ].filter(Boolean);

    await this.sendText(channel, recipientId, truncate(lines.join("\n")));
  }

  async sendTrackingUpdate(
    channel: ChannelType,
    recipientId: string,
    payload: { summary: string; trackingUrl: string },
  ) {
    if (channel === "web") return;

    if (channel === "telegram") {
      const text = [
        payload.summary,
        !isTelegramSafeUrl(payload.trackingUrl)
          ? "Local dev note: tracking button is hidden because WEB_BASE_URL points to localhost."
          : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      await this.sendTelegramMessage(recipientId, truncate(text), {
        replyMarkup: isTelegramSafeUrl(payload.trackingUrl)
          ? {
              inline_keyboard: [[{ text: "Track order", url: payload.trackingUrl }]],
            }
          : undefined,
      });
      return;
    }

    const text = truncate(`${payload.summary}\n\nTrack order: ${payload.trackingUrl}`);
    await this.sendText(channel, recipientId, text);
  }

  async sendText(channel: ChannelType, recipientId: string, text: string) {
    switch (channel) {
      case "telegram":
        return this.sendTelegramMessage(recipientId, text);
      case "whatsapp":
        return this.sendWhatsAppMessage(recipientId, text);
      case "web":
        return;
    }
  }

  async answerTelegramCallbackQuery(callbackQueryId: string, text?: string) {
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.warn("TELEGRAM_BOT_TOKEN is not configured. Skipping Telegram callback answer.");
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ body, status: response.status }, "Telegram callback acknowledgement failed.");
    }
  }

  async sendTelegramOfferSelection(
    recipientId: string,
    payload: {
      summary: string;
      checkoutUrl: string;
      resultsUrl: string;
      walletCheckoutUrl?: string;
    },
  ) {
    const text = [
      payload.summary,
      !isTelegramSafeUrl(payload.checkoutUrl)
        ? "Local dev note: checkout buttons are hidden because WEB_BASE_URL points to localhost."
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    await this.sendTelegramMessage(recipientId, truncate(text), {
      replyMarkup: {
        inline_keyboard: [
          ...(isTelegramSafeUrl(payload.checkoutUrl)
            ? [[{ text: "Checkout now", url: payload.checkoutUrl }]]
            : []),
          ...(isTelegramSafeUrl(payload.walletCheckoutUrl)
            ? [[{ text: "Pay with wallet", url: payload.walletCheckoutUrl }]]
            : []),
          ...(isTelegramSafeUrl(payload.resultsUrl)
            ? [[{ text: "View details", url: payload.resultsUrl }]]
            : []),
        ],
      },
    });
  }

  private async sendTelegramMessage(
    chatId: string,
    text: string,
    options?: { replyMarkup?: TelegramInlineKeyboard },
  ) {
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.warn("TELEGRAM_BOT_TOKEN is not configured. Skipping Telegram send.");
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: options?.replyMarkup,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ body, status: response.status }, "Telegram send failed.");
    }
  }

  private async sendTelegramPhoto(
    chatId: string,
    photoUrl: string,
    caption: string,
    options?: { replyMarkup?: TelegramInlineKeyboard },
  ) {
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.warn("TELEGRAM_BOT_TOKEN is not configured. Skipping Telegram send.");
      return false;
    }

    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        reply_markup: options?.replyMarkup,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ body, status: response.status }, "Telegram photo send failed.");
      return false;
    }

    return true;
  }

  private async sendTelegramProductCard(
    recipientId: string,
    offer: AssistantReply["topOffers"][number],
    searchSessionId?: string,
  ) {
    const text = [
      offer.merchant,
      compactOfferTitle(offer.title, 72),
      `${this.formatNaira(offer.totalCost)} • ${offer.etaLabel} • ${offer.rating.toFixed(1)}★`,
      offer.summary ? offer.summary.slice(0, 160) : null,
    ]
      .filter(Boolean)
      .join("\n");

    const replyMarkup = searchSessionId
      ? {
          inline_keyboard: [[{ text: "Buy", callback_data: `choose:${searchSessionId}:${offer.id}` }]],
        }
      : undefined;

    const imageUrl = offer.imageUrl;
    if (imageUrl && isRemoteMediaUrl(imageUrl)) {
      const sent = await this.sendTelegramPhoto(recipientId, imageUrl, truncate(text, 1024), {
        replyMarkup,
      });
      if (sent) {
        return;
      }
    }

    await this.sendTelegramMessage(recipientId, truncate(text), { replyMarkup });
  }

  private formatNaira(amount: number) {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private async sendWhatsAppMessage(recipientId: string, text: string) {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      logger.warn(
        "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured. Skipping WhatsApp send.",
      );
      return;
    }

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipientId,
          type: "text",
          text: {
            body: text,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      logger.error({ body, status: response.status }, "WhatsApp send failed.");
    }
  }
}
