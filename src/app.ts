import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { getPrismaClient } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { MemoryStore } from "@/store/memory-store";
import { PrismaStore } from "@/store/prisma-store";
import { ZeroGAiProvider } from "@/services/ai/zero-g-ai-provider";
import { JumiaMerchantAdapter } from "@/services/search/jumia-adapter";
import { KongaMerchantAdapter } from "@/services/search/konga-adapter";
import { AliExpressMerchantAdapter } from "@/services/search/aliexpress-adapter";
import { SearchService } from "@/services/search/search-service";
import { DeepLinkService } from "@/services/auth/deep-link-service";
import { ChannelReplyService } from "@/services/channels/channel-reply-service";
import { OutboundMessageService } from "@/services/channels/outbound-message-service";
import { ConversationService } from "@/services/conversations/conversation-service";
import { OrderService } from "@/services/orders/order-service";
import { createWebhookRouter } from "@/routes/webhooks";
import { createConversationRouter } from "@/routes/conversations";
import { createSearchSessionRouter } from "@/routes/search-sessions";
import { createCheckoutSessionRouter } from "@/routes/checkout-sessions";
import { createOrderRouter } from "@/routes/orders";
import { createAdminRouter } from "@/routes/admin";
import { createCustomerRouter } from "@/routes/customers";
import { createWalletRouter } from "@/routes/wallets";
import { adminAuthMiddleware } from "@/middleware/admin-auth";

export function createApp() {
  const store = env.DATABASE_URL ? new PrismaStore(getPrismaClient()) : new MemoryStore();
  const aiProvider = new ZeroGAiProvider();
  const merchantAdapters = [
    new JumiaMerchantAdapter(env.JUMIA_SEARCH_BASE_URL, {
      mode: "live",
      timeoutMs: env.MERCHANT_HTTP_TIMEOUT_MS,
      userAgent: env.MERCHANT_USER_AGENT,
      browserAutomationEnabled: env.MERCHANT_BROWSER_AUTOMATION_ENABLED,
      browserTimeoutMs: env.MERCHANT_BROWSER_TIMEOUT_MS,
    }),
    new KongaMerchantAdapter(env.KONGA_SEARCH_BASE_URL, {
      mode: "live",
      timeoutMs: env.MERCHANT_HTTP_TIMEOUT_MS,
      userAgent: env.MERCHANT_USER_AGENT,
      browserAutomationEnabled: env.MERCHANT_BROWSER_AUTOMATION_ENABLED,
      browserTimeoutMs: env.MERCHANT_BROWSER_TIMEOUT_MS,
    }),
    new AliExpressMerchantAdapter({
      mode: "live",
      timeoutMs: env.MERCHANT_HTTP_TIMEOUT_MS,
      userAgent: env.MERCHANT_USER_AGENT,
      browserAutomationEnabled: env.MERCHANT_BROWSER_AUTOMATION_ENABLED,
      browserTimeoutMs: env.MERCHANT_BROWSER_TIMEOUT_MS,
    }),
  ];
  const searchService = new SearchService(aiProvider, merchantAdapters);
  const deepLinkService = new DeepLinkService();
  const channelReplyService = new ChannelReplyService(deepLinkService, aiProvider);
  const outboundMessageService = new OutboundMessageService();
  const orderService = new OrderService(store, undefined, channelReplyService, outboundMessageService);
  const conversationService = new ConversationService(
    store,
    aiProvider,
    searchService,
    channelReplyService,
    outboundMessageService,
    deepLinkService,
  );

  const app = express();

  app.use(
    pinoHttp({
      logger,
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: [env.WEB_BASE_URL],
      credentials: true,
    }),
  );
  app.use(
    express.json({
      verify: (request, _response, buffer) => {
        (request as express.Request).rawBody = Buffer.from(buffer);
      },
    }),
  );

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "cartpilot-backend",
      uptime: process.uptime(),
    });
  });

  app.use("/api/webhooks", createWebhookRouter(conversationService));
  app.use("/api/conversations", createConversationRouter(conversationService));
  app.use("/api/search-sessions", createSearchSessionRouter(store, orderService, deepLinkService));
  app.use("/api/checkout-sessions", createCheckoutSessionRouter(store, orderService));
  app.use("/api/orders", createOrderRouter(store, orderService, deepLinkService));
  app.use("/api/customers", createCustomerRouter(store));
  app.use("/api/wallets", createWalletRouter(store));
  app.use("/api/admin", adminAuthMiddleware, createAdminRouter(orderService));

  app.use((_request, _response, next) => {
    next(new HttpError(404, "Route not found."));
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const message =
        error instanceof Error ? error.message : "Unexpected server error.";

      response.status(statusCode).json({
        error: {
          message,
          details: error instanceof HttpError ? error.details : undefined,
        },
      });
    },
  );

  return app;
}
