import { createHash } from "node:crypto";
import { createId } from "@/lib/ids";
import {
  AdminAction,
  ChannelIdentity,
  CustomerWallet,
  CustomerProfile,
  ChannelType,
  CheckoutSession,
  ConversationSession,
  Order,
  PaymentMethod,
  SavedAddress,
  SearchSession,
  TrackingEvent,
  WalletTransaction,
} from "@/domain/types";
import { Store } from "@/store/store";

export class MemoryStore implements Store {
  private readonly channelIdentities = new Map<string, ChannelIdentity>();
  private readonly conversationSessions = new Map<string, ConversationSession>();
  private readonly searchSessions = new Map<string, SearchSession>();
  private readonly checkoutSessions = new Map<string, CheckoutSession>();
  private readonly orders = new Map<string, Order>();
  private readonly trackingEvents = new Map<string, TrackingEvent[]>();
  private readonly adminActions = new Map<string, AdminAction[]>();
  private readonly customerProfiles = new Map<string, CustomerProfile>();
  private readonly paymentMethods = new Map<string, PaymentMethod[]>();
  private readonly savedAddresses = new Map<string, SavedAddress[]>();
  private readonly wallets = new Map<string, CustomerWallet>();
  private readonly walletTransactions = new Map<string, WalletTransaction[]>();

  private getCustomerKey(channel: ChannelType, externalId: string) {
    return `${channel}:${externalId}`;
  }

  private createDefaultProfile(displayName?: string): CustomerProfile {
    return {
      fullName: displayName ?? "CartPilot Customer",
      email: "customer@example.com",
      phone: "",
      city: "Lagos",
      address: "",
    };
  }

  private createDefaultPaymentMethods(): PaymentMethod[] {
    return [
      { id: "card-1", brand: "Visa", last4: "4839", expiry: "09/28", isDefault: true },
      { id: "card-2", brand: "Mastercard", last4: "1124", expiry: "02/27", isDefault: false },
    ];
  }

  private createWalletAddress(key: string) {
    return `0x${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
  }

  private createDefaultAddresses(profile: CustomerProfile): SavedAddress[] {
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

  private createDefaultWallet(key: string): CustomerWallet {
    const now = new Date().toISOString();
    return {
      id: createId("wallet"),
      assetSymbol: "USDT",
      network: "Base",
      walletAddress: this.createWalletAddress(key),
      availableBalance: 950000,
      pendingBalance: 0,
      lastUpdatedAt: now,
    };
  }

  private async getOrCreateChannelIdentity(channel: ChannelType, externalId: string, displayName?: string) {
    const key = `${channel}:${externalId}`;
    const now = new Date().toISOString();
    const existing = this.channelIdentities.get(key);

    if (existing) {
      const updated = { ...existing, displayName: displayName ?? existing.displayName, updatedAt: now };
      this.channelIdentities.set(key, updated);
      return updated;
    }

    const identity: ChannelIdentity = {
      id: createId("identity"),
      channel,
      externalId,
      displayName,
      createdAt: now,
      updatedAt: now,
    };

    this.channelIdentities.set(key, identity);
    return identity;
  }

  async getOrCreateConversationSession(channel: ChannelType, externalId: string, displayName?: string) {
    const identity = await this.getOrCreateChannelIdentity(channel, externalId, displayName);
    const existing = [...this.conversationSessions.values()].find(
      (session) => session.channelIdentityId === identity.id,
    );
    const now = new Date().toISOString();

    if (existing) {
      const updated = { ...existing, updatedAt: now, lastMessageAt: now };
      this.conversationSessions.set(updated.id, updated);
      return updated;
    }

    const session: ConversationSession = {
      id: createId("session"),
      channelIdentityId: identity.id,
      channel,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    };

    this.conversationSessions.set(session.id, session);
    return session;
  }

  async createSearchSession(searchSession: SearchSession) {
    this.searchSessions.set(searchSession.id, searchSession);
    return searchSession;
  }

  async getSearchSession(id: string) {
    return this.searchSessions.get(id) ?? null;
  }

  async listSearchSessionsForIdentity(channel: ChannelType, externalId: string) {
    const key = this.getCustomerKey(channel, externalId);
    const identity = this.channelIdentities.get(key);
    if (!identity) return [];

    const conversationSessionIds = [...this.conversationSessions.values()]
      .filter((session) => session.channelIdentityId === identity.id)
      .map((session) => session.id);

    return [...this.searchSessions.values()]
      .filter((session) => conversationSessionIds.includes(session.conversationSessionId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createCheckoutSession(checkoutSession: CheckoutSession) {
    this.checkoutSessions.set(checkoutSession.id, checkoutSession);
    return checkoutSession;
  }

  async getCheckoutSession(id: string) {
    return this.checkoutSessions.get(id) ?? null;
  }

  async createOrder(order: Order) {
    this.orders.set(order.publicOrderId, order);
    return order;
  }

  async updateOrder(publicOrderId: string, update: Partial<Order>) {
    const existing = this.orders.get(publicOrderId);
    if (!existing) return null;
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.orders.set(publicOrderId, updated);
    return updated;
  }

  async getOrder(publicOrderId: string) {
    return this.orders.get(publicOrderId) ?? null;
  }

  async listOrders() {
    return [...this.orders.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async addTrackingEvent(event: TrackingEvent) {
    const current = this.trackingEvents.get(event.orderId) ?? [];
    current.push(event);
    this.trackingEvents.set(event.orderId, current);
    return event;
  }

  async getTrackingEvents(orderId: string) {
    return this.trackingEvents.get(orderId) ?? [];
  }

  async addAdminAction(action: AdminAction) {
    const current = this.adminActions.get(action.orderId) ?? [];
    current.push(action);
    this.adminActions.set(action.orderId, current);
    return action;
  }

  async getAdminActions(orderId: string) {
    return this.adminActions.get(orderId) ?? [];
  }

  async getCustomerProfile(channel: ChannelType, externalId: string, displayName?: string) {
    const key = this.getCustomerKey(channel, externalId);
    const existing = this.customerProfiles.get(key);

    if (existing) return existing;

    const profile = this.createDefaultProfile(displayName);
    this.customerProfiles.set(key, profile);
    return profile;
  }

  async updateCustomerProfile(channel: ChannelType, externalId: string, profile: Partial<CustomerProfile>) {
    const nextProfile = {
      ...(await this.getCustomerProfile(channel, externalId)),
      ...profile,
    };
    this.customerProfiles.set(this.getCustomerKey(channel, externalId), nextProfile);
    return nextProfile;
  }

  async getPaymentMethods(channel: ChannelType, externalId: string) {
    const key = this.getCustomerKey(channel, externalId);
    const existing = this.paymentMethods.get(key);

    if (existing?.length) return existing;

    const defaults = this.createDefaultPaymentMethods();
    this.paymentMethods.set(key, defaults);
    return defaults;
  }

  async setPaymentMethods(channel: ChannelType, externalId: string, methods: PaymentMethod[]) {
    this.paymentMethods.set(this.getCustomerKey(channel, externalId), methods);
    return methods;
  }

  async listOrdersForIdentity(channel: ChannelType, externalId: string) {
    const searchSessionIds = new Set(
      (await this.listSearchSessionsForIdentity(channel, externalId)).map((session) => session.id),
    );

    return (await this.listOrders()).filter((order) => searchSessionIds.has(order.searchSessionId));
  }

  async getRecipientForSearchSession(searchSessionId: string) {
    const searchSession = await this.getSearchSession(searchSessionId);
    if (!searchSession) return null;

    const conversationSession = this.conversationSessions.get(searchSession.conversationSessionId);
    if (!conversationSession) return null;

    const identity = [...this.channelIdentities.values()].find(
      (entry) => entry.id === conversationSession.channelIdentityId,
    );

    if (!identity) return null;

    return {
      channel: identity.channel,
      externalId: identity.externalId,
      displayName: identity.displayName,
    };
  }

  async getSavedAddresses(channel: ChannelType, externalId: string, displayName?: string) {
    const key = this.getCustomerKey(channel, externalId);
    const existing = this.savedAddresses.get(key);
    if (existing?.length) return existing;

    const defaults = this.createDefaultAddresses(
        await this.getCustomerProfile(channel, externalId, displayName),
    );
    this.savedAddresses.set(key, defaults);
    return defaults;
  }

  async setSavedAddresses(channel: ChannelType, externalId: string, addresses: SavedAddress[]) {
    const normalized = addresses.map((address, index) => ({
      ...address,
      isDefault: address.isDefault || index === 0,
    }));
    this.savedAddresses.set(this.getCustomerKey(channel, externalId), normalized);
    return normalized;
  }

  async getWallet(channel: ChannelType, externalId: string) {
    const key = this.getCustomerKey(channel, externalId);
    const existing = this.wallets.get(key);
    if (existing) return existing;

    const wallet = this.createDefaultWallet(key);
    this.wallets.set(key, wallet);
    return wallet;
  }

  async getWalletTransactions(channel: ChannelType, externalId: string) {
    const key = this.getCustomerKey(channel, externalId);
    return this.walletTransactions.get(key) ?? [];
  }

  private async pushWalletTransaction(channel: ChannelType, externalId: string, transaction: WalletTransaction) {
    const key = this.getCustomerKey(channel, externalId);
    const current = this.walletTransactions.get(key) ?? [];
    current.unshift(transaction);
    this.walletTransactions.set(key, current);
    return transaction;
  }

  async createWalletTopupIntent(
    channel: ChannelType,
    externalId: string,
    input: { amount: number; assetSymbol: string; network: string },
  ) {
    const wallet = await this.getWallet(channel, externalId);
    const now = new Date().toISOString();
    const transaction: WalletTransaction = {
      id: createId("wallet_tx"),
      type: "topup",
      status: "pending",
      amount: input.amount,
      assetSymbol: input.assetSymbol,
      network: input.network,
      reference: `TOPUP-${Date.now()}`,
      walletAddress: wallet.walletAddress,
      note: `Awaiting on-chain deposit to ${wallet.walletAddress}.`,
      createdAt: now,
    };

    this.wallets.set(this.getCustomerKey(channel, externalId), {
      ...wallet,
      pendingBalance: wallet.pendingBalance + input.amount,
      lastUpdatedAt: now,
    });

    await this.pushWalletTransaction(channel, externalId, transaction);
    return {
      wallet: await this.getWallet(channel, externalId),
      transaction,
    };
  }

  async completeWalletTopup(channel: ChannelType, externalId: string, transactionId: string) {
    const key = this.getCustomerKey(channel, externalId);
    const wallet = await this.getWallet(channel, externalId);
    const transactions = this.walletTransactions.get(key) ?? [];
    const transaction = transactions.find((entry) => entry.id === transactionId);
    if (!transaction || transaction.type !== "topup") return null;
    if (transaction.status === "completed") {
      return { wallet, transaction };
    }

    transaction.status = "completed";
    transaction.note = `On-chain deposit confirmed on ${transaction.network}.`;

    const updatedWallet = {
      ...wallet,
      availableBalance: wallet.availableBalance + transaction.amount,
      pendingBalance: Math.max(0, wallet.pendingBalance - transaction.amount),
      lastUpdatedAt: new Date().toISOString(),
    };

    this.wallets.set(key, updatedWallet);
    this.walletTransactions.set(key, [...transactions]);
    return {
      wallet: updatedWallet,
      transaction,
    };
  }

  async debitWalletForOrder(
    channel: ChannelType,
    externalId: string,
    input: { amount: number; reference: string; note: string },
  ) {
    const key = this.getCustomerKey(channel, externalId);
    const wallet = await this.getWallet(channel, externalId);
    if (wallet.availableBalance < input.amount) return null;

    const updatedWallet = {
      ...wallet,
      availableBalance: wallet.availableBalance - input.amount,
      lastUpdatedAt: new Date().toISOString(),
    };
    this.wallets.set(key, updatedWallet);

    const transaction: WalletTransaction = {
      id: createId("wallet_tx"),
      type: "order_payment",
      status: "completed",
      amount: input.amount,
      assetSymbol: wallet.assetSymbol,
      network: wallet.network,
      reference: input.reference,
      walletAddress: wallet.walletAddress,
      note: input.note,
      createdAt: new Date().toISOString(),
    };
    await this.pushWalletTransaction(channel, externalId, transaction);

    return {
      wallet: updatedWallet,
      transaction,
    };
  }
}
