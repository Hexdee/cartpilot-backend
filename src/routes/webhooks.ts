import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "@/config/env";
import { verifyHmacSignature } from "@/lib/signatures";
import { ConversationService } from "@/services/conversations/conversation-service";
import { HttpError } from "@/lib/http-error";

const telegramMessageSchema = z.object({
  update_id: z.number().optional(),
  message: z
    .object({
      chat: z.object({ id: z.number(), first_name: z.string().optional() }),
      text: z.string().optional(),
    })
    .optional(),
  business_message: z
    .object({
      chat: z.object({ id: z.number(), first_name: z.string().optional() }),
      text: z.string().optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      from: z.object({ id: z.number(), first_name: z.string().optional() }).optional(),
      message: z
        .object({
          chat: z.object({ id: z.number(), first_name: z.string().optional() }),
        })
        .optional(),
    })
    .optional(),
});

export function createWebhookRouter(conversationService: ConversationService) {
  const router = Router();

  const handleWhatsAppVerification = (request: Request, response: Response, next: NextFunction) => {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];

    if (mode !== "subscribe" || token !== env.WHATSAPP_VERIFY_TOKEN) {
      return next(new HttpError(403, "Invalid WhatsApp verification request."));
    }

    return response.status(200).send(challenge);
  };

  router.get("/whatsapp", handleWhatsAppVerification);
  router.get("/whatsapp/verify", handleWhatsAppVerification);

  router.post("/whatsapp", async (request, response, next) => {
    try {
      const signature = request.header("x-hub-signature-256");
      if (env.WHATSAPP_APP_SECRET && !verifyHmacSignature(signature, env.WHATSAPP_APP_SECRET, request.rawBody ?? Buffer.from(JSON.stringify(request.body)))) {
        throw new HttpError(401, "Invalid WhatsApp signature.");
      }

      const messages = request.body?.entry?.flatMap((entry: { changes?: Array<{ value?: { messages?: Array<{ from?: string; text?: { body?: string } }> } }> }) =>
        entry.changes ?? [],
      ) ?? [];

      for (const change of messages) {
        const message = change.value?.messages?.[0];
        const sender = message?.from;
        const text = message?.text?.body;

        if (sender && text) {
          await conversationService.handleInboundMessage({
            channel: "whatsapp",
            externalUserId: sender,
            message: text,
          });
        }
      }

      return response.status(200).json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/telegram", async (request, response, next) => {
    try {
      const secret = request.header("x-telegram-bot-api-secret-token");
      if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        throw new HttpError(401, "Invalid Telegram webhook secret.");
      }

      const payload = telegramMessageSchema.parse(request.body);
      const source = payload.message ?? payload.business_message;

      if (source?.chat.id && source.text) {
        await conversationService.handleInboundMessage({
          channel: "telegram",
          externalUserId: String(source.chat.id),
          displayName: source.chat.first_name,
          message: source.text,
        });
      }

      if (payload.callback_query?.id && payload.callback_query.data && payload.callback_query.message?.chat.id) {
        await conversationService.handleTelegramCallback({
          externalUserId: String(payload.callback_query.message.chat.id),
          displayName:
            payload.callback_query.from?.first_name ??
            payload.callback_query.message.chat.first_name,
          callbackQueryId: payload.callback_query.id,
          data: payload.callback_query.data,
        });
      }

      return response.status(200).json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
