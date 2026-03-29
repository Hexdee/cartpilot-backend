import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { Order, SearchSession } from "@/domain/types";

type LinkPayload = {
  resourceType: "search_session" | "checkout_session" | "order";
  resourceId: string;
};

export class DeepLinkService {
  sign(payload: LinkPayload, expiresIn: jwt.SignOptions["expiresIn"] = "1h") {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
  }

  verify(token: string): LinkPayload {
    return jwt.verify(token, env.JWT_SECRET) as LinkPayload;
  }

  resultsLink(searchSession: SearchSession) {
    const token = this.sign({
      resourceType: "search_session",
      resourceId: searchSession.id,
    });

    return `${env.WEB_BASE_URL}/results?searchSession=${searchSession.id}&token=${token}`;
  }

  checkoutLink(checkoutSessionId: string) {
    const token = this.sign({
      resourceType: "checkout_session",
      resourceId: checkoutSessionId,
    });
    return this.withQueryParams(`${env.WEB_BASE_URL}/checkout`, {
      checkoutSession: checkoutSessionId,
      token,
    });
  }

  trackingLink(order: Order) {
    const token = this.sign({
      resourceType: "order",
      resourceId: order.publicOrderId,
    });

    return this.withQueryParams(`${env.WEB_BASE_URL}/tracking`, {
      orderId: order.publicOrderId,
      token,
    });
  }

  checkoutLinkWithOptions(
    checkoutSessionId: string,
    options?: Record<string, string | undefined>,
  ) {
    const token = this.sign({
      resourceType: "checkout_session",
      resourceId: checkoutSessionId,
    });

    return this.withQueryParams(`${env.WEB_BASE_URL}/checkout`, {
      checkoutSession: checkoutSessionId,
      token,
      ...options,
    });
  }

  private withQueryParams(
    baseUrl: string,
    params: Record<string, string | undefined>,
  ) {
    const url = new URL(baseUrl);

    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }
}
