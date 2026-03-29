import { Router } from "express";
import { z } from "zod";
import { Store } from "@/store/store";
import { OrderService } from "@/services/orders/order-service";
import { HttpError } from "@/lib/http-error";

const bodySchema = z.object({
  searchSessionId: z.string().min(2),
  offerId: z.string().min(2),
  payload: z.record(z.any()).optional(),
});

export function createCheckoutSessionRouter(store: Store, orderService: OrderService) {
  const router = Router();

  router.post("/", async (request, response, next) => {
    try {
      const body = bodySchema.parse(request.body);
      const session = await store.getSearchSession(body.searchSessionId);
      if (!session) throw new HttpError(404, "Search session not found.");

      const offer = session.offers.find((entry) => entry.id === body.offerId);
      if (!offer) throw new HttpError(404, "Offer not found.");

      const checkoutSession = await orderService.createCheckoutSession({
        id: `checkout_${Date.now()}`,
        searchSessionId: session.id,
        offerId: offer.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        channel: session.channel,
        payload: body.payload ?? {},
        createdAt: new Date().toISOString(),
      });

      response.status(201).json(checkoutSession);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const checkoutSession = await orderService.getCheckoutSession(request.params.id);
      if (!checkoutSession) throw new HttpError(404, "Checkout session not found.");
      response.json(checkoutSession);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
