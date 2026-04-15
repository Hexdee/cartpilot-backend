import { createHash } from "node:crypto";
import {
  ChannelType as PrismaChannelType,
  OrderStatus as PrismaOrderStatus,
  Prisma,
  PrismaClient,
  WalletTransactionStatus as PrismaWalletTransactionStatus,
  WalletTransactionType as PrismaWalletTransactionType,
} from "@prisma/client";
import {
  AdminAction,
  ChannelType,
  CheckoutSession,
  ConversationSession,
  CustomerProfile,
  CustomerWallet,
  MerchantOfferSnapshot,
  Order,
  PaymentMethod,
  SavedAddress,
  SearchSession,
  TrackingEvent,
  WalletTransaction,
} from "@/domain/types";
import { createId } from "@/lib/ids";
import { Store } from "@/store/store";

function asPrismaChannel(channel: ChannelType): PrismaChannelType {
  return channel as PrismaChannelType;
}

function asPrismaStatus(status: Order["status"]): PrismaOrderStatus {
  return status as PrismaOrderStatus;
}

function createDefaultProfile(displayName?: string): CustomerProfile {
  return {
    fullName: displayName ?? "CartPilot Customer",
    email: "customer@example.com",
    phone: "",
    city: "Lagos",
    address: "",
  };
}

function createDefaultPaymentMethods(): PaymentMethod[] {
  return [
    { id: createId("card"), brand: "Visa", last4: "4839", expiry: "09/28", isDefault: true },
    { id: createId("card"), brand: "Mastercard", last4: "1124", expiry: "02/27", isDefault: false },
  ];
}

function createWalletAddress(key: string) {
  return `0x${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
}

function createDefaultAddresses(profile: CustomerProfile): SavedAddress[] {
  return [
    {
      id: createId("address"),
      label: "Home",
      fullName: profile.fullName,
      phone: profile.phone || "+234 801 234 5678",
      addressLine: profile.address || "14 Admiralty Way, Lekki Phase 1",
      city: profile.city || "Lagos",
      note: "Call before arrival.",
      isDefault: true,
    },
    {
      id: createId("address"),
      label: "Office",
      fullName: profile.fullName,
      phone: profile.phone || "+234 801 234 5678",
      addressLine: "42B Adeola Odeku Street, Victoria Island",
      city: "Lagos",
      note: "Reception closes at 6 PM.",
      isDefault: false,
    },
  ];
}

function toDomainConversationSession(record: {
  id: string;
  channelIdentityId: string;
  channel: PrismaChannelType;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
}): ConversationSession {
  return {
    id: record.id,
    channelIdentityId: record.channelIdentityId,
    channel: record.channel as ChannelType,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastMessageAt: record.lastMessageAt.toISOString(),
  };
}

function toDomainSearchSession(record: {
  id: string;
  conversationSessionId: string;
  query: string;
  rankingMode: string;
  productKey: string;
  budget: number | null;
  color: string | null;
  explanation: string;
  offerSnapshot: unknown;
  createdAt: Date;
  conversationSession: { channel: PrismaChannelType };
}): SearchSession {
  return {
    id: record.id,
    conversationSessionId: record.conversationSessionId,
    channel: record.conversationSession.channel as ChannelType,
    intent: {
      query: record.query,
      productKey: record.productKey as SearchSession["intent"]["productKey"],
      rankingMode: record.rankingMode as SearchSession["intent"]["rankingMode"],
      budget: record.budget,
      color: record.color,
    },
    offers: record.offerSnapshot as MerchantOfferSnapshot[],
    explanation: record.explanation,
    createdAt: record.createdAt.toISOString(),
  };
}

function toDomainCheckoutSession(record: {
  id: string;
  searchSessionId: string;
  offerId: string;
  channel: PrismaChannelType;
  expiresAt: Date;
  payload: unknown;
  createdAt: Date;
}): CheckoutSession {
  return {
    id: record.id,
    searchSessionId: record.searchSessionId,
    offerId: record.offerId,
    channel: record.channel as ChannelType,
    expiresAt: record.expiresAt.toISOString(),
    payload: (record.payload ?? {}) as Record<string, unknown>,
    createdAt: record.createdAt.toISOString(),
  };
}

function toDomainOrder(record: {
  id: string;
  publicOrderId: string;
  checkoutSessionId: string;
  searchSessionId: string;
  offerId: string;
  channel: PrismaChannelType;
  recipientExternalId: string | null;
  status: PrismaOrderStatus;
  paymentMethod: string;
  feeAmount: number;
  totalAmount: number;
  paymentReference: string;
  merchantOrderReference: string | null;
  customerPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Order {
  return {
    id: record.id,
    publicOrderId: record.publicOrderId,
    checkoutSessionId: record.checkoutSessionId,
    searchSessionId: record.searchSessionId,
    offerId: record.offerId,
    channel: record.channel as ChannelType,
    recipientExternalId: record.recipientExternalId ?? undefined,
    status: record.status as Order["status"],
    paymentMethod: record.paymentMethod as Order["paymentMethod"],
    feeAmount: record.feeAmount,
    totalAmount: record.totalAmount,
    paymentReference: record.paymentReference,
    merchantOrderReference: record.merchantOrderReference ?? undefined,
    customer: record.customerPayload as Order["customer"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toDomainTrackingEvent(record: {
  id: string;
  status: PrismaOrderStatus;
  title: string;
  detail: string;
  createdAt: Date;
}, publicOrderId: string): TrackingEvent {
  return {
    id: record.id,
    orderId: publicOrderId,
    status: record.status as TrackingEvent["status"],
    title: record.title,
    detail: record.detail,
    createdAt: record.createdAt.toISOString(),
  };
}

function toDomainAdminAction(record: {
  id: string;
  action: string;
  actor: string;
  metadata: unknown;
  createdAt: Date;
}, publicOrderId: string): AdminAction {
  return {
    id: record.id,
    orderId: publicOrderId,
    action: record.action,
    actor: record.actor,
    metadata: (record.metadata ?? undefined) as Record<string, unknown> | undefined,
    createdAt: record.createdAt.toISOString(),
  };
}

function toDomainProfile(record: {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
}): CustomerProfile {
  return {
    fullName: record.fullName,
    email: record.email,
    phone: record.phone,
    city: record.city,
    address: record.address,
  };
}

function toDomainPaymentMethod(record: {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
}): PaymentMethod {
  return {
    id: record.id,
    brand: record.brand,
    last4: record.last4,
    expiry: record.expiry,
    isDefault: record.isDefault,
  };
}

function toDomainSavedAddress(record: {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  note: string | null;
  isDefault: boolean;
}): SavedAddress {
  return {
    id: record.id,
    label: record.label,
    fullName: record.fullName,
    phone: record.phone,
    addressLine: record.addressLine,
    city: record.city,
    note: record.note ?? undefined,
    isDefault: record.isDefault,
  };
}

function toDomainWallet(record: {
  id: string;
  assetSymbol: string;
  network: string;
  walletAddress: string;
  availableBalance: number;
  pendingBalance: number;
  lastUpdatedAt: Date;
}): CustomerWallet {
  return {
    id: record.id,
    assetSymbol: record.assetSymbol,
    network: record.network,
    walletAddress: record.walletAddress,
    availableBalance: record.availableBalance,
    pendingBalance: record.pendingBalance,
    lastUpdatedAt: record.lastUpdatedAt.toISOString(),
  };
}

function toDomainWalletTransaction(record: {
  id: string;
  type: PrismaWalletTransactionType;
  status: PrismaWalletTransactionStatus;
  amount: number;
  assetSymbol: string;
  network: string;
  reference: string;
  walletAddress: string;
  note: string;
  createdAt: Date;
}): WalletTransaction {
  return {
    id: record.id,
    type: record.type as WalletTransaction["type"],
    status: record.status as WalletTransaction["status"],
    amount: record.amount,
    assetSymbol: record.assetSymbol,
    network: record.network,
    reference: record.reference,
    walletAddress: record.walletAddress,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}

export class PrismaStore implements Store {
  constructor(private readonly prisma: PrismaClient) {}

  private async getOrCreateChannelIdentity(channel: ChannelType, externalId: string, displayName?: string) {
    const now = new Date();
    return this.prisma.channelIdentity.upsert({
      where: {
        channel_externalId: {
          channel: asPrismaChannel(channel),
          externalId,
        },
      },
      update: {
        updatedAt: now,
        ...(displayName ? { displayName } : {}),
      },
      create: {
        id: createId("identity"),
        channel: asPrismaChannel(channel),
        externalId,
        displayName,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async getOrCreateConversationSession(channel: ChannelType, externalId: string, displayName?: string) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId, displayName);
    const now = new Date();
    const existing = await this.prisma.conversationSession.findFirst({
      where: {
        channelIdentityId: identity.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existing) {
      const updated = await this.prisma.conversationSession.update({
        where: {
          id: existing.id,
        },
        data: {
          updatedAt: now,
          lastMessageAt: now,
        },
      });
      return toDomainConversationSession(updated);
    }

    const created = await this.prisma.conversationSession.create({
      data: {
        id: createId("session"),
        channelIdentityId: identity.id,
        channel: asPrismaChannel(channel),
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      },
    });

    return toDomainConversationSession(created);
  }

  async createSearchSession(searchSession: SearchSession) {
    await this.prisma.searchSession.create({
      data: {
        id: searchSession.id,
        conversationSessionId: searchSession.conversationSessionId,
        query: searchSession.intent.query,
        rankingMode: searchSession.intent.rankingMode,
        productKey: searchSession.intent.productKey,
        budget: searchSession.intent.budget,
        color: searchSession.intent.color,
        explanation: searchSession.explanation,
        offerSnapshot: searchSession.offers as unknown as Prisma.InputJsonValue,
        createdAt: new Date(searchSession.createdAt),
      },
    });
    return searchSession;
  }

  async getSearchSession(id: string) {
    const record = await this.prisma.searchSession.findUnique({
      where: { id },
      include: {
        conversationSession: true,
      },
    });

    return record ? toDomainSearchSession(record) : null;
  }

  async listSearchSessionsForIdentity(channel: ChannelType, externalId: string) {
    const records = await this.prisma.searchSession.findMany({
      where: {
        conversationSession: {
          channelIdentity: {
            channel: asPrismaChannel(channel),
            externalId,
          },
        },
      },
      include: {
        conversationSession: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return records.map(toDomainSearchSession);
  }

  async createCheckoutSession(checkoutSession: CheckoutSession) {
    await this.prisma.checkoutSession.create({
      data: {
        id: checkoutSession.id,
        searchSessionId: checkoutSession.searchSessionId,
        offerId: checkoutSession.offerId,
        channel: asPrismaChannel(checkoutSession.channel),
        expiresAt: new Date(checkoutSession.expiresAt),
        payload: checkoutSession.payload as Prisma.InputJsonValue,
        createdAt: new Date(checkoutSession.createdAt),
      },
    });

    return checkoutSession;
  }

  async getCheckoutSession(id: string) {
    const record = await this.prisma.checkoutSession.findUnique({
      where: { id },
    });

    return record ? toDomainCheckoutSession(record) : null;
  }

  async createOrder(order: Order) {
    const created = await this.prisma.order.create({
      data: {
        id: order.id,
        publicOrderId: order.publicOrderId,
        checkoutSessionId: order.checkoutSessionId,
        searchSessionId: order.searchSessionId,
        offerId: order.offerId,
        channel: asPrismaChannel(order.channel),
        recipientExternalId: order.recipientExternalId,
        status: asPrismaStatus(order.status),
        paymentMethod: order.paymentMethod,
        feeAmount: order.feeAmount,
        totalAmount: order.totalAmount,
        paymentReference: order.paymentReference,
        merchantOrderReference: order.merchantOrderReference,
        customerPayload: order.customer as Prisma.InputJsonValue,
        createdAt: new Date(order.createdAt),
        updatedAt: new Date(order.updatedAt),
      },
    });

    return toDomainOrder(created);
  }

  async updateOrder(publicOrderId: string, update: Partial<Order>) {
    const existing = await this.prisma.order.findUnique({
      where: { publicOrderId },
    });
    if (!existing) return null;

    const updated = await this.prisma.order.update({
      where: { publicOrderId },
      data: {
        ...(update.status ? { status: asPrismaStatus(update.status) } : {}),
        ...(update.paymentMethod ? { paymentMethod: update.paymentMethod } : {}),
        ...(update.merchantOrderReference !== undefined
          ? { merchantOrderReference: update.merchantOrderReference ?? null }
          : {}),
        ...(update.recipientExternalId !== undefined
          ? { recipientExternalId: update.recipientExternalId ?? null }
          : {}),
        ...(update.customer ? { customerPayload: update.customer as Prisma.InputJsonValue } : {}),
        ...(update.paymentReference ? { paymentReference: update.paymentReference } : {}),
        ...(update.feeAmount !== undefined ? { feeAmount: update.feeAmount } : {}),
        ...(update.totalAmount !== undefined ? { totalAmount: update.totalAmount } : {}),
        updatedAt: new Date(),
      },
    });

    return toDomainOrder(updated);
  }

  async getOrder(publicOrderId: string) {
    const record = await this.prisma.order.findUnique({
      where: { publicOrderId },
    });

    return record ? toDomainOrder(record) : null;
  }

  async listOrders() {
    const records = await this.prisma.order.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return records.map(toDomainOrder);
  }

  async addTrackingEvent(event: TrackingEvent) {
    const order = await this.prisma.order.findUnique({
      where: { publicOrderId: event.orderId },
    });
    if (!order) {
      throw new Error("Order not found for tracking event.");
    }

    const created = await this.prisma.trackingEvent.create({
      data: {
        id: event.id,
        orderDbId: order.id,
        status: event.status as PrismaOrderStatus,
        title: event.title,
        detail: event.detail,
        createdAt: new Date(event.createdAt),
      },
    });

    return toDomainTrackingEvent(created, order.publicOrderId);
  }

  async getTrackingEvents(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicOrderId: orderId },
      include: {
        trackingEvents: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
    if (!order) return [];

    return order.trackingEvents.map((entry) => toDomainTrackingEvent(entry, order.publicOrderId));
  }

  async addAdminAction(action: AdminAction) {
    const order = await this.prisma.order.findUnique({
      where: { publicOrderId: action.orderId },
    });
    if (!order) {
      throw new Error("Order not found for admin action.");
    }

    const created = await this.prisma.adminAction.create({
      data: {
        id: action.id,
        orderDbId: order.id,
        action: action.action,
        actor: action.actor,
        metadata: action.metadata as Prisma.InputJsonValue | undefined,
        createdAt: new Date(action.createdAt),
      },
    });

    return toDomainAdminAction(created, order.publicOrderId);
  }

  async getAdminActions(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicOrderId: orderId },
      include: {
        adminActions: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
    if (!order) return [];

    return order.adminActions.map((entry) => toDomainAdminAction(entry, order.publicOrderId));
  }

  async getCustomerProfile(channel: ChannelType, externalId: string, displayName?: string) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId, displayName);
    const existing = await this.prisma.customerProfile.findUnique({
      where: {
        channelIdentityId: identity.id,
      },
    });

    if (existing) {
      return toDomainProfile(existing);
    }

    const defaults = createDefaultProfile(displayName);
    const now = new Date();
    const created = await this.prisma.customerProfile.create({
      data: {
        id: createId("profile"),
        channelIdentityId: identity.id,
        ...defaults,
        createdAt: now,
        updatedAt: now,
      },
    });
    return toDomainProfile(created);
  }

  async updateCustomerProfile(channel: ChannelType, externalId: string, profile: Partial<CustomerProfile>) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId);
    const current = await this.getCustomerProfile(channel, externalId);
    const nextProfile = {
      ...current,
      ...profile,
    };

    const updated = await this.prisma.customerProfile.upsert({
      where: {
        channelIdentityId: identity.id,
      },
      update: {
        ...nextProfile,
        updatedAt: new Date(),
      },
      create: {
        id: createId("profile"),
        channelIdentityId: identity.id,
        ...nextProfile,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return toDomainProfile(updated);
  }

  async getPaymentMethods(channel: ChannelType, externalId: string) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId);
    let records = await this.prisma.savedPaymentMethod.findMany({
      where: { channelIdentityId: identity.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    if (!records.length) {
      const now = new Date();
      const defaults = createDefaultPaymentMethods();
      await this.prisma.savedPaymentMethod.createMany({
        data: defaults.map((entry) => ({
          id: entry.id,
          channelIdentityId: identity.id,
          brand: entry.brand,
          last4: entry.last4,
          expiry: entry.expiry,
          isDefault: entry.isDefault,
          createdAt: now,
          updatedAt: now,
        })),
      });
      records = await this.prisma.savedPaymentMethod.findMany({
        where: { channelIdentityId: identity.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
    }

    return records.map(toDomainPaymentMethod);
  }

  async setPaymentMethods(channel: ChannelType, externalId: string, methods: PaymentMethod[]) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.savedPaymentMethod.deleteMany({
        where: { channelIdentityId: identity.id },
      }),
      this.prisma.savedPaymentMethod.createMany({
        data: methods.map((entry, index) => ({
          id: entry.id,
          channelIdentityId: identity.id,
          brand: entry.brand,
          last4: entry.last4,
          expiry: entry.expiry,
          isDefault: entry.isDefault || index === 0,
          createdAt: now,
          updatedAt: now,
        })),
      }),
    ]);

    return this.getPaymentMethods(channel, externalId);
  }

  async getSavedAddresses(channel: ChannelType, externalId: string, displayName?: string) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId, displayName);
    let records = await this.prisma.savedAddress.findMany({
      where: { channelIdentityId: identity.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    if (!records.length) {
      const profile = await this.getCustomerProfile(channel, externalId, displayName);
      const defaults = createDefaultAddresses(profile);
      const now = new Date();
      await this.prisma.savedAddress.createMany({
        data: defaults.map((entry) => ({
          id: entry.id,
          channelIdentityId: identity.id,
          label: entry.label,
          fullName: entry.fullName,
          phone: entry.phone,
          addressLine: entry.addressLine,
          city: entry.city,
          note: entry.note,
          isDefault: entry.isDefault,
          createdAt: now,
          updatedAt: now,
        })),
      });
      records = await this.prisma.savedAddress.findMany({
        where: { channelIdentityId: identity.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
    }

    return records.map(toDomainSavedAddress);
  }

  async setSavedAddresses(channel: ChannelType, externalId: string, addresses: SavedAddress[]) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.savedAddress.deleteMany({
        where: { channelIdentityId: identity.id },
      }),
      this.prisma.savedAddress.createMany({
        data: addresses.map((entry, index) => ({
          id: entry.id,
          channelIdentityId: identity.id,
          label: entry.label,
          fullName: entry.fullName,
          phone: entry.phone,
          addressLine: entry.addressLine,
          city: entry.city,
          note: entry.note,
          isDefault: entry.isDefault || index === 0,
          createdAt: now,
          updatedAt: now,
        })),
      }),
    ]);

    return this.getSavedAddresses(channel, externalId);
  }

  async getWallet(channel: ChannelType, externalId: string) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId);
    const existing = await this.prisma.customerWallet.findUnique({
      where: {
        channelIdentityId: identity.id,
      },
    });

    if (existing) {
      return toDomainWallet(existing);
    }

    const now = new Date();
    const created = await this.prisma.customerWallet.create({
      data: {
        id: createId("wallet"),
        channelIdentityId: identity.id,
        assetSymbol: "USDT",
        network: "Base",
        walletAddress: createWalletAddress(`${channel}:${externalId}`),
        availableBalance: 950000,
        pendingBalance: 0,
        lastUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    return toDomainWallet(created);
  }

  async getWalletTransactions(channel: ChannelType, externalId: string) {
    const wallet = await this.getWallet(channel, externalId);
    const records = await this.prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return records.map(toDomainWalletTransaction);
  }

  async createWalletTopupIntent(
    channel: ChannelType,
    externalId: string,
    input: { amount: number; assetSymbol: string; network: string },
  ) {
    const wallet = await this.getWallet(channel, externalId);
    const now = new Date();
    const updatedWallet = await this.prisma.customerWallet.update({
      where: { id: wallet.id },
      data: {
        pendingBalance: wallet.pendingBalance + input.amount,
        lastUpdatedAt: now,
        updatedAt: now,
      },
    });
    const transaction = await this.prisma.walletTransaction.create({
      data: {
        id: createId("wallet_tx"),
        walletId: wallet.id,
        type: PrismaWalletTransactionType.topup,
        status: PrismaWalletTransactionStatus.pending,
        amount: input.amount,
        assetSymbol: input.assetSymbol,
        network: input.network,
        reference: `TOPUP-${Date.now()}`,
        walletAddress: wallet.walletAddress,
        note: `Awaiting on-chain deposit to ${wallet.walletAddress}.`,
        createdAt: now,
      },
    });

    return {
      wallet: toDomainWallet(updatedWallet),
      transaction: toDomainWalletTransaction(transaction),
    };
  }

  async completeWalletTopup(channel: ChannelType, externalId: string, transactionId: string) {
    const wallet = await this.getWallet(channel, externalId);
    const transaction = await this.prisma.walletTransaction.findFirst({
      where: {
        id: transactionId,
        walletId: wallet.id,
      },
    });
    if (!transaction) return null;

    if (transaction.status === PrismaWalletTransactionStatus.completed) {
      const latestWallet = await this.prisma.customerWallet.findUniqueOrThrow({
        where: { id: wallet.id },
      });
      return {
        wallet: toDomainWallet(latestWallet),
        transaction: toDomainWalletTransaction(transaction),
      };
    }

    const now = new Date();
    const [updatedWallet, updatedTransaction] = await this.prisma.$transaction([
      this.prisma.customerWallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: wallet.availableBalance + transaction.amount,
          pendingBalance: Math.max(0, wallet.pendingBalance - transaction.amount),
          lastUpdatedAt: now,
          updatedAt: now,
        },
      }),
      this.prisma.walletTransaction.update({
        where: { id: transactionId },
        data: {
          status: PrismaWalletTransactionStatus.completed,
          note: `On-chain deposit confirmed on ${transaction.network}.`,
        },
      }),
    ]);

    return {
      wallet: toDomainWallet(updatedWallet),
      transaction: toDomainWalletTransaction(updatedTransaction),
    };
  }

  async debitWalletForOrder(
    channel: ChannelType,
    externalId: string,
    input: { amount: number; reference: string; note: string },
  ) {
    const wallet = await this.getWallet(channel, externalId);
    if (wallet.availableBalance < input.amount) return null;

    const now = new Date();
    const [updatedWallet, transaction] = await this.prisma.$transaction([
      this.prisma.customerWallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: wallet.availableBalance - input.amount,
          lastUpdatedAt: now,
          updatedAt: now,
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          id: createId("wallet_tx"),
          walletId: wallet.id,
          type: PrismaWalletTransactionType.order_payment,
          status: PrismaWalletTransactionStatus.completed,
          amount: input.amount,
          assetSymbol: wallet.assetSymbol,
          network: wallet.network,
          reference: input.reference,
          walletAddress: wallet.walletAddress,
          note: input.note,
          createdAt: now,
        },
      }),
    ]);

    return {
      wallet: toDomainWallet(updatedWallet),
      transaction: toDomainWalletTransaction(transaction),
    };
  }

  async listOrdersForIdentity(channel: ChannelType, externalId: string) {
    const records = await this.prisma.order.findMany({
      where: {
        searchSession: {
          conversationSession: {
            channelIdentity: {
              channel: asPrismaChannel(channel),
              externalId,
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return records.map(toDomainOrder);
  }

  async getRecipientForSearchSession(searchSessionId: string) {
    const searchSession = await this.prisma.searchSession.findUnique({
      where: { id: searchSessionId },
      include: {
        conversationSession: {
          include: {
            channelIdentity: true,
          },
        },
      },
    });

    if (!searchSession) return null;

    return {
      channel: searchSession.conversationSession.channelIdentity.channel as ChannelType,
      externalId: searchSession.conversationSession.channelIdentity.externalId,
      displayName: searchSession.conversationSession.channelIdentity.displayName ?? undefined,
    };
  }

  async getSearchCountToday(channel: ChannelType, externalId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return this.prisma.searchSession.count({
      where: {
        conversationSession: {
          channelIdentity: {
            channel: asPrismaChannel(channel),
            externalId,
          },
        },
        createdAt: {
          gte: startOfDay,
        },
      },
    });
  }
}
