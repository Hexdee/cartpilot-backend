import { Router } from "express";
import { z } from "zod";
import { Store } from "@/store/store";
import { OrderService } from "@/services/orders/order-service";
import { DeepLinkService } from "@/services/auth/deep-link-service";
import { HttpError } from "@/lib/http-error";

const selectBodySchema = z.object({
  offerId: z.string().min(2),
});

export function createSearchSessionRouter(
  store: Store,
  orderService: OrderService,
  deepLinkService: DeepLinkService,
) {
  const router = Router();

  router.get("/:id", async (request, response, next) => {
    try {
      const session = await store.getSearchSession(request.params.id);
      if (!session) throw new HttpError(404, "Search session not found.");
      response.json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/select-offer", async (request, response, next) => {
    try {
      const session = await store.getSearchSession(request.params.id);
      if (!session) throw new HttpError(404, "Search session not found.");

      const body = selectBodySchema.parse(request.body);
      const offer = session.offers.find((entry) => entry.id === body.offerId);
      if (!offer) throw new HttpError(404, "Offer not found for search session.");

      const checkoutSession = await orderService.createCheckoutSession({
        id: `checkout_${Date.now()}`,
        searchSessionId: session.id,
        offerId: offer.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        channel: session.channel,
        payload: {},
        createdAt: new Date().toISOString(),
      });

      response.status(200).json({
        checkoutSession,
        webLinks: {
          checkout: deepLinkService.checkoutLink(checkoutSession.id),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
