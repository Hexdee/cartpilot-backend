import { Router } from "express";
import { z } from "zod";
import { Store } from "@/store/store";
import { HttpError } from "@/lib/http-error";

const paramsSchema = z.object({
  channel: z.enum(["whatsapp", "telegram", "web"]),
  externalUserId: z.string().min(2),
});

const topupSchema = z.object({
  amount: z.number().positive(),
  assetSymbol: z.string().min(2).default("USDT"),
  network: z.string().min(2).default("Base"),
});

export function createWalletRouter(store: Store) {
  const router = Router();

  router.post("/:channel/:externalUserId/topups", async (request, response, next) => {
    try {
      const { channel, externalUserId } = paramsSchema.parse(request.params);
      const body = topupSchema.parse(request.body);
      const result = await store.createWalletTopupIntent(channel, externalUserId, body);

      response.status(201).json({
        wallet: result.wallet,
        transaction: result.transaction,
        instructions: {
          network: result.transaction.network,
          assetSymbol: result.transaction.assetSymbol,
          walletAddress: result.transaction.walletAddress,
          reference: result.transaction.reference,
          message:
            "Send the exact amount to the wallet address on the selected network. CartPilot credits the in-app wallet after confirmation.",
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:channel/:externalUserId/topups/:transactionId/sandbox-credit", async (request, response, next) => {
    try {
      const { channel, externalUserId } = paramsSchema.parse(request.params);
      const transactionId = z.string().min(2).parse(request.params.transactionId);
      const result = await store.completeWalletTopup(channel, externalUserId, transactionId);
      if (!result) throw new HttpError(404, "Wallet top-up not found.");

      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
