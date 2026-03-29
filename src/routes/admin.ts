import { Router } from "express";
import { z } from "zod";
import { OrderService } from "@/services/orders/order-service";

const placeBodySchema = z.object({
  merchantOrderReference: z.string().min(2),
});

const statusBodySchema = z.object({
  status: z.enum([
    "pending_payment",
    "paid",
    "awaiting_admin_order",
    "ordered_on_merchant",
    "merchant_processing",
    "shipped",
    "out_for_delivery",
    "delivered",
    "issue_reported",
    "cancelled",
    "refunded",
  ]),
  detail: z.string().min(2),
});

export function createAdminRouter(orderService: OrderService) {
  const router = Router();

  router.get("/orders", async (_request, response, next) => {
    try {
      response.json(await orderService.listOrders());
    } catch (error) {
      next(error);
    }
  });

  router.get("/orders/:id", async (request, response, next) => {
    try {
      const order = await orderService.getOrder(request.params.id);
      if (!order) {
        throw new Error("Order not found.");
      }
      response.json({
        order,
        tracking: await orderService.getTracking(request.params.id),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/orders/:id/place", async (request, response, next) => {
    try {
      const body = placeBodySchema.parse(request.body);
      const updated = await orderService.placeOrder(
        request.params.id,
        request.adminActor ?? "admin-api",
        body.merchantOrderReference,
      );
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.post("/orders/:id/status", async (request, response, next) => {
    try {
      const body = statusBodySchema.parse(request.body);
      const updated = await orderService.updateStatus(
        request.params.id,
        request.adminActor ?? "admin-api",
        body.status,
        body.detail,
      );
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
