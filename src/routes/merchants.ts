import { Router } from "express";
import { z } from "zod";
import { MerchantAdapter } from "@/services/search/merchant-adapter";
import { HttpError } from "@/lib/http-error";
import { ProductKey } from "@/domain/types";

const searchBodySchema = z.object({
  merchant: z.string(),
  request: z.object({
    query: z.string(),
    productKey: z.string().transform((val) => val as ProductKey),
    budget: z.number().nullable(),
    color: z.string().nullable(),
  }),
});

export function createMerchantRouter(merchantAdapters: MerchantAdapter[]) {
  const router = Router();

  router.post("/search", async (request, response, next) => {
    try {
      const body = searchBodySchema.parse(request.body);
      const adapter = merchantAdapters.find((a) => a.merchant === body.merchant);

      if (!adapter) {
        throw new HttpError(404, `Merchant adapter for ${body.merchant} not found.`);
      }

      // To prevent infinite loops, we can use a custom request object or just call the adapter.
      // But since the adapter's configuration is tied to the current env, if this instance
      // is the remote one, it might also try to fallback to itself if we're not careful.
      // However, tryRemoteFallback in LiveMerchantAdapter checks if PUBLIC_BASE_URL === REMOTE_FALLBACK_BASE_URL.
      // So if this deployed instance has PUBLIC_BASE_URL=https://cartpilot.onrender.com
      // and REMOTE_FALLBACK_BASE_URL=https://cartpilot.onrender.com, it will skip the remote fallback.

      const result = await adapter.searchProducts(body.request);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
