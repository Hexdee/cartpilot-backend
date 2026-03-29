import { createId } from "@/lib/ids";
import { OrderStatus, TrackingEvent } from "@/domain/types";

export function createTrackingEvent(
  orderId: string,
  status: OrderStatus,
  title: string,
  detail: string,
): TrackingEvent {
  return {
    id: createId("tracking"),
    orderId,
    status,
    title,
    detail,
    createdAt: new Date().toISOString(),
  };
}
