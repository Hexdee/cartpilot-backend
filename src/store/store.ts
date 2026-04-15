import {
  AdminAction,
  ChannelType,
  CheckoutSession,
  ConversationSession,
  CustomerProfile,
  CustomerWallet,
  Order,
  PaymentMethod,
  SavedAddress,
  SearchSession,
  TrackingEvent,
  WalletTransaction,
} from "@/domain/types";

export interface Store {
  getOrCreateConversationSession(
    channel: ChannelType,
    externalId: string,
    displayName?: string,
  ): Promise<ConversationSession>;
  createSearchSession(searchSession: SearchSession): Promise<SearchSession>;
  getSearchSession(id: string): Promise<SearchSession | null>;
  listSearchSessionsForIdentity(channel: ChannelType, externalId: string): Promise<SearchSession[]>;
  createCheckoutSession(checkoutSession: CheckoutSession): Promise<CheckoutSession>;
  getCheckoutSession(id: string): Promise<CheckoutSession | null>;
  createOrder(order: Order): Promise<Order>;
  updateOrder(publicOrderId: string, update: Partial<Order>): Promise<Order | null>;
  getOrder(publicOrderId: string): Promise<Order | null>;
  listOrders(): Promise<Order[]>;
  addTrackingEvent(event: TrackingEvent): Promise<TrackingEvent>;
  getTrackingEvents(orderId: string): Promise<TrackingEvent[]>;
  addAdminAction(action: AdminAction): Promise<AdminAction>;
  getAdminActions(orderId: string): Promise<AdminAction[]>;
  getCustomerProfile(
    channel: ChannelType,
    externalId: string,
    displayName?: string,
  ): Promise<CustomerProfile>;
  updateCustomerProfile(
    channel: ChannelType,
    externalId: string,
    profile: Partial<CustomerProfile>,
  ): Promise<CustomerProfile>;
  getPaymentMethods(channel: ChannelType, externalId: string): Promise<PaymentMethod[]>;
  setPaymentMethods(
    channel: ChannelType,
    externalId: string,
    methods: PaymentMethod[],
  ): Promise<PaymentMethod[]>;
  getSavedAddresses(
    channel: ChannelType,
    externalId: string,
    displayName?: string,
  ): Promise<SavedAddress[]>;
  setSavedAddresses(
    channel: ChannelType,
    externalId: string,
    addresses: SavedAddress[],
  ): Promise<SavedAddress[]>;
  getWallet(channel: ChannelType, externalId: string): Promise<CustomerWallet>;
  getWalletTransactions(channel: ChannelType, externalId: string): Promise<WalletTransaction[]>;
  createWalletTopupIntent(
    channel: ChannelType,
    externalId: string,
    input: { amount: number; assetSymbol: string; network: string },
  ): Promise<{ wallet: CustomerWallet; transaction: WalletTransaction }>;
  completeWalletTopup(
    channel: ChannelType,
    externalId: string,
    transactionId: string,
  ): Promise<{ wallet: CustomerWallet; transaction: WalletTransaction } | null>;
  debitWalletForOrder(
    channel: ChannelType,
    externalId: string,
    input: { amount: number; reference: string; note: string },
  ): Promise<{ wallet: CustomerWallet; transaction: WalletTransaction } | null>;
  listOrdersForIdentity(channel: ChannelType, externalId: string): Promise<Order[]>;
  getRecipientForSearchSession(
    searchSessionId: string,
  ): Promise<{ channel: ChannelType; externalId: string; displayName?: string } | null>;
  getSearchCountToday(channel: ChannelType, externalId: string): Promise<number>;
}
