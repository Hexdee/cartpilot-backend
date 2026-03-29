import { Router } from "express";
import { z } from "zod";
import { Store } from "@/store/store";

const paramsSchema = z.object({
  channel: z.enum(["whatsapp", "telegram", "web"]),
  externalUserId: z.string().min(2),
});

const paymentMethodSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  last4: z.string().min(2),
  expiry: z.string().min(2),
  isDefault: z.boolean(),
});

const savedAddressSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  fullName: z.string().min(2),
  phone: z.string().min(3),
  addressLine: z.string().min(5),
  city: z.string().min(2),
  note: z.string().optional(),
  isDefault: z.boolean(),
});

const bodySchema = z.object({
  profile: z
    .object({
      fullName: z.string().min(2).optional(),
      email: z.string().email().optional(),
      phone: z.string().min(3).optional(),
      city: z.string().min(2).optional(),
      address: z.string().min(2).optional(),
    })
    .optional(),
  paymentMethods: z.array(paymentMethodSchema).optional(),
  savedAddresses: z.array(savedAddressSchema).optional(),
});

export function createCustomerRouter(store: Store) {
  const router = Router();

  router.get("/:channel/:externalUserId", async (request, response, next) => {
    try {
      const { channel, externalUserId } = paramsSchema.parse(request.params);
      const profile = await store.getCustomerProfile(channel, externalUserId);
      const paymentMethods = await store.getPaymentMethods(channel, externalUserId);
      const savedAddresses = await store.getSavedAddresses(channel, externalUserId);
      const wallet = await store.getWallet(channel, externalUserId);
      const walletTransactions = await store.getWalletTransactions(channel, externalUserId);
      const searchHistory = await store.listSearchSessionsForIdentity(channel, externalUserId);
      const orders = await store.listOrdersForIdentity(channel, externalUserId);

      response.json({
        profile,
        paymentMethods,
        savedAddresses,
        wallet,
        walletTransactions,
        searchHistory,
        orders,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:channel/:externalUserId", async (request, response, next) => {
    try {
      const { channel, externalUserId } = paramsSchema.parse(request.params);
      const body = bodySchema.parse(request.body);

      const profile = body.profile
        ? await store.updateCustomerProfile(channel, externalUserId, body.profile)
        : await store.getCustomerProfile(channel, externalUserId);
      const paymentMethods = body.paymentMethods
        ? await store.setPaymentMethods(channel, externalUserId, body.paymentMethods)
        : await store.getPaymentMethods(channel, externalUserId);
      const savedAddresses = body.savedAddresses
        ? await store.setSavedAddresses(channel, externalUserId, body.savedAddresses)
        : await store.getSavedAddresses(channel, externalUserId);

      response.json({
        profile,
        paymentMethods,
        savedAddresses,
        wallet: await store.getWallet(channel, externalUserId),
        walletTransactions: await store.getWalletTransactions(channel, externalUserId),
        searchHistory: await store.listSearchSessionsForIdentity(channel, externalUserId),
        orders: await store.listOrdersForIdentity(channel, externalUserId),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
