import { Router } from "express";
import { z } from "zod";
import { HttpError } from "@/lib/http-error";
import { Store } from "@/store/store";
import { OrderService } from "@/services/orders/order-service";
import { DeepLinkService } from "@/services/auth/deep-link-service";

const createOrderSchema = z.object({
  checkoutSessionId: z.string().min(2),
  paymentReference: z.string().min(2).optional(),
  paymentMethod: z.enum(["wallet", "card"]).default("card"),
  customer: z.object({
    fullName: z.string().min(2),
    phone: z.string().min(3),
    address: z.string().min(5),
    city: z.string().min(2),
    note: z.string().optional(),
  }),
});

export function createOrderRouter(
  store: Store,
  orderService: OrderService,
  deepLinkService: DeepLinkService,
) {
  const router = Router();

  router.post("/", async (request, response, next) => {
    try {
      const body = createOrderSchema.parse(request.body);
      const checkoutSession = await orderService.getCheckoutSession(body.checkoutSessionId);
      if (!checkoutSession) throw new HttpError(404, "Checkout session not found.");

      const searchSession = await store.getSearchSession(checkoutSession.searchSessionId);
      if (!searchSession) throw new HttpError(404, "Search session not found.");

      const offer = searchSession.offers.find((entry) => entry.id === checkoutSession.offerId);
      if (!offer) throw new HttpError(404, "Offer not found.");

      const feeAmount = Math.max(3900, Math.round(offer.totalCost * 0.014));
      const recipient = await store.getRecipientForSearchSession(searchSession.id);
      const order = await orderService.createOrder({
        checkoutSessionId: checkoutSession.id,
        searchSessionId: searchSession.id,
        offerId: offer.id,
        channel: checkoutSession.channel,
        recipientExternalId: recipient?.externalId,
        paymentReference: body.paymentReference ?? `PAY-${Date.now()}`,
        paymentMethod: body.paymentMethod,
        customer: body.customer,
        feeAmount,
        totalAmount: offer.totalCost + feeAmount,
      });

      response.status(201).json({
        order,
        webLinks: {
          tracking: deepLinkService.trackingLink(order),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const order = await orderService.getOrder(request.params.id);
      if (!order) throw new HttpError(404, "Order not found.");
      response.json(order);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/tracking", async (request, response, next) => {
    try {
      const order = await orderService.getOrder(request.params.id);
      if (!order) throw new HttpError(404, "Order not found.");
      response.json({
        order,
        tracking: await orderService.getTracking(request.params.id),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
