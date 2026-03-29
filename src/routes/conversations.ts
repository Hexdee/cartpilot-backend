import { Router } from "express";
import { z } from "zod";
import { ConversationService } from "@/services/conversations/conversation-service";

const paramsSchema = z.object({
  channel: z.enum(["whatsapp", "telegram", "web"]),
  sessionId: z.string().min(2),
});

const bodySchema = z.object({
  message: z.string().min(2),
  displayName: z.string().optional(),
});

export function createConversationRouter(conversationService: ConversationService) {
  const router = Router();

  router.post("/:channel/:sessionId/message", async (request, response, next) => {
    try {
      const { channel, sessionId } = paramsSchema.parse(request.params);
      const body = bodySchema.parse(request.body);
      const result = await conversationService.handleInboundMessage({
        channel,
        externalUserId: sessionId,
        displayName: body.displayName,
        message: body.message,
      });

      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
