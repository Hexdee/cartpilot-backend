import { createId } from "@/lib/ids";
import { HttpError } from "@/lib/http-error";
import { Store } from "@/store/store";
import { createJobQueue, JobQueue } from "@/services/queue/job-queue";
import { createTrackingEvent } from "@/services/tracking/tracking-service";
import { CheckoutSession, Order, OrderStatus } from "@/domain/types";
import { ChannelReplyService } from "@/services/channels/channel-reply-service";
import { OutboundMessageService } from "@/services/channels/outbound-message-service";

export class OrderService {
  constructor(
    private readonly store: Store,
    private readonly queue: JobQueue = createJobQueue(),
    private readonly channelReplyService?: ChannelReplyService,
    private readonly outboundMessageService?: OutboundMessageService,
  ) {}

  async createCheckoutSession(payload: CheckoutSession) {
    return this.store.createCheckoutSession(payload);
  }

  async getCheckoutSession(id: string) {
    return this.store.getCheckoutSession(id);
  }

  async createOrder(input: {
    checkoutSessionId: string;
    searchSessionId: string;
    offerId: string;
    channel: Order["channel"];
    paymentReference: string;
    paymentMethod: Order["paymentMethod"];
    customer: Order["customer"];
    feeAmount: number;
    totalAmount: number;
    recipientExternalId?: string;
  }) {
    const now = new Date().toISOString();
    const order: Order = {
      id: createId("order"),
      publicOrderId: `CP-${Math.floor(Date.now() / 1000)}`,
      checkoutSessionId: input.checkoutSessionId,
      searchSessionId: input.searchSessionId,
      offerId: input.offerId,
      channel: input.channel,
      recipientExternalId: input.recipientExternalId,
      status: "awaiting_admin_order",
      paymentMethod: input.paymentMethod,
      feeAmount: input.feeAmount,
      totalAmount: input.totalAmount,
      customer: input.customer,
      paymentReference: input.paymentReference,
      createdAt: now,
      updatedAt: now,
    };

    if (input.paymentMethod === "wallet") {
      if (!input.recipientExternalId) {
        throw new HttpError(400, "Wallet payments require a known customer identity.");
      }

      const debit = await this.store.debitWalletForOrder(input.channel, input.recipientExternalId, {
        amount: input.totalAmount,
        reference: input.paymentReference,
        note: `Wallet payment for order ${order.publicOrderId}.`,
      });

      if (!debit) {
        throw new HttpError(400, "Insufficient wallet balance for this order.");
      }
    }

    await this.store.createOrder(order);
    await this.store.addTrackingEvent(
      createTrackingEvent(order.publicOrderId, "paid", "Payment received", `Payment ${input.paymentReference} confirmed.`),
    );
    await this.store.addTrackingEvent(
      createTrackingEvent(
        order.publicOrderId,
        "awaiting_admin_order",
        "Awaiting admin purchase",
        "Assigned to CartPilot Ops for merchant-side ordering.",
      ),
    );
    await this.store.addAdminAction({
      id: createId("admin_action"),
      orderId: order.publicOrderId,
      actor: "system",
      action: "order_created",
      metadata: { paymentReference: input.paymentReference },
      createdAt: now,
    });
    void this.queue.enqueue("notify_admin_new_order", { orderId: order.publicOrderId });
    void this.notifyCustomer(order);

    return order;
  }

  async getOrder(orderId: string) {
    return this.store.getOrder(orderId);
  }

  async listOrders() {
    return this.store.listOrders();
  }

  async getTracking(orderId: string) {
    return this.store.getTrackingEvents(orderId);
  }

  async placeOrder(orderId: string, actor: string, merchantOrderReference: string) {
    const order = await this.store.getOrder(orderId);
    if (!order) throw new HttpError(404, "Order not found.");

    const updated = await this.store.updateOrder(orderId, {
      status: "ordered_on_merchant",
      merchantOrderReference,
    });

    if (!updated) throw new HttpError(404, "Order not found.");

    await this.store.addTrackingEvent(
      createTrackingEvent(
        orderId,
        "ordered_on_merchant",
        "Ordering on merchant site",
        `Merchant checkout completed with reference ${merchantOrderReference}.`,
      ),
    );
    await this.store.addAdminAction({
      id: createId("admin_action"),
      orderId,
      actor,
      action: "merchant_order_placed",
      metadata: { merchantOrderReference },
      createdAt: new Date().toISOString(),
    });
    void this.notifyCustomer(updated);
    return updated;
  }

  async updateStatus(orderId: string, actor: string, status: OrderStatus, detail: string) {
    const order = await this.store.getOrder(orderId);
    if (!order) throw new HttpError(404, "Order not found.");

    const updated = await this.store.updateOrder(orderId, { status });
    if (!updated) throw new HttpError(404, "Order not found.");

    const title = status.replace(/_/g, " ");
    await this.store.addTrackingEvent(
      createTrackingEvent(orderId, status, title[0].toUpperCase() + title.slice(1), detail),
    );
    await this.store.addAdminAction({
      id: createId("admin_action"),
      orderId,
      actor,
      action: "status_updated",
      metadata: { status, detail },
      createdAt: new Date().toISOString(),
    });
    void this.queue.enqueue("notify_customer_tracking_update", { orderId, status, detail });
    void this.notifyCustomer(updated);
    return updated;
  }

  private async notifyCustomer(order: Order) {
    if (!this.channelReplyService || !this.outboundMessageService) return;
    if (!order.recipientExternalId || order.channel === "web") return;

    const tracking = await this.getTracking(order.publicOrderId);
    const reply = await this.channelReplyService.buildTrackingReply(order, tracking);
    await this.outboundMessageService.sendTrackingUpdate(order.channel, order.recipientExternalId, reply);
  }
}
