import { Router } from "express";
import { z } from "zod";
import { ConversationService } from "@/services/conversations/conversation-service";
import { logger } from "@/lib/logger";

const paramsSchema = z.object({
  channel: z.enum(["whatsapp", "telegram", "web"]),
  sessionId: z.string().min(2),
});

const bodySchema = z.object({
  message: z.string().min(2),
  displayName: z.string().optional(),
  rankingMode: z
    .enum(["fastest_delivery", "lowest_total_price", "highest_rating", "balanced"])
    .optional(),
});

export function createConversationRouter(conversationService: ConversationService) {
  const router = Router();

  router.post("/:channel/:sessionId/message", async (request, response, next) => {
    try {
      const { channel, sessionId } = paramsSchema.parse(request.params);
      const body = bodySchema.parse(request.body);

      logger.info(
        { channel, sessionId, message: body.message },
        "Handling inbound conversation message.",
      );

      const result = await conversationService.handleInboundMessage({
        channel,
        externalUserId: sessionId,
        displayName: body.displayName,
        message: body.message,
        rankingModeOverride: body.rankingMode,
      });

      response.status(200).json(result);
    } catch (error) {
      logger.error({ error, params: request.params }, "Failed to handle conversation message.");
      next(error);
    }
  });

  return router;
}
