export type ChannelType = "whatsapp" | "telegram" | "web";

export type RankingMode =
  | "fastest_delivery"
  | "lowest_total_price"
  | "highest_rating"
  | "balanced";

export type ProductKey =
  | "custom"
  | "sony_wh1000xm5"
  | "office_chair"
  | "portable_blender"
  | "ps5_controller"
  | "air_fryer";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "awaiting_admin_order"
  | "ordered_on_merchant"
  | "merchant_processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "issue_reported"
  | "cancelled"
  | "refunded";

export interface ChannelIdentity {
  id: string;
  channel: ChannelType;
  externalId: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSession {
  id: string;
  channelIdentityId: string;
  channel: ChannelType;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface SearchIntent {
  query: string;
  productKey: ProductKey;
  rankingMode: RankingMode;
  budget: number | null;
  color: string | null;
}

export type MerchantSearchMode = "seed" | "live" | "hybrid";

export interface MerchantSearchRequest {
  query: string;
  productKey: ProductKey;
  budget: number | null;
  color: string | null;
}

export interface MerchantRawOffer {
  id: string;
  merchant: string;
  sourceUrl: string;
  title: string;
  summary?: string;
  imageUrl?: string;
  price?: number;
  priceText?: string;
  shippingCost?: number;
  shippingText?: string;
  rating?: number;
  ratingText?: string;
  etaHours?: number;
  etaText?: string;
  availabilityText?: string;
  officialStore?: boolean;
  sellerName?: string;
  color?: string | null;
  raw?: Record<string, unknown>;
}

export interface MerchantSearchSource {
  merchant: string;
  mode: MerchantSearchMode;
  resultCount: number;
  filteredResultCount?: number;
  normalizedResultCount?: number;
  relevantResultCount?: number;
  finalResultCount?: number;
  warnings?: string[];
  searchUrl?: string;
}

export interface MerchantOfferSnapshot {
  id: string;
  merchant: string;
  merchantCategory: "live" | "demo";
  title: string;
  summary: string;
  sourceUrl: string;
  imageUrl?: string;
  productKey: ProductKey;
  price: number;
  shippingCost: number;
  totalCost: number;
  rating: number;
  etaHours: number;
  etaLabel: string;
  availability: string;
  officialStore: boolean;
  color?: string;
}

export interface SearchSession {
  id: string;
  conversationSessionId: string;
  channel: ChannelType;
  intent: SearchIntent;
  offers: MerchantOfferSnapshot[];
  explanation: string;
  createdAt: string;
}

export interface AssistantReply {
  summary: string;
  clarifyingQuestion?: string;
  searchSessionId?: string;
  page?: number;
  pageSize?: number;
  totalOffers?: number;
  hasMore?: boolean;
  topOffers: Array<{
    id: string;
    merchant: string;
    title: string;
    summary: string;
    sourceUrl: string;
    imageUrl?: string;
    totalCost: number;
    etaLabel: string;
    rating: number;
  }>;
  webLinks: {
    results: string;
    checkout?: string;
  };
}

export interface CheckoutSession {
  id: string;
  searchSessionId: string;
  offerId: string;
  expiresAt: string;
  channel: ChannelType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TrackingEvent {
  id: string;
  orderId: string;
  status: OrderStatus;
  title: string;
  detail: string;
  createdAt: string;
}

export interface Order {
  id: string;
  publicOrderId: string;
  checkoutSessionId: string;
  searchSessionId: string;
  offerId: string;
  channel: ChannelType;
  recipientExternalId?: string;
  status: OrderStatus;
  paymentMethod: "wallet" | "card";
  feeAmount: number;
  totalAmount: number;
  customer: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    note?: string;
  };
  paymentReference: string;
  merchantOrderReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAction {
  id: string;
  orderId: string;
  actor: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SearchResult {
  intent: SearchIntent;
  offers: MerchantOfferSnapshot[];
  explanation: string;
  sources?: MerchantSearchSource[];
}

export interface CustomerProfile {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
}

export interface SavedAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  note?: string;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
}

export interface CustomerWallet {
  id: string;
  assetSymbol: string;
  network: string;
  walletAddress: string;
  availableBalance: number;
  pendingBalance: number;
  lastUpdatedAt: string;
}

export type WalletTransactionType = "topup" | "order_payment" | "refund";
export type WalletTransactionStatus = "pending" | "completed" | "failed";

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amount: number;
  assetSymbol: string;
  network: string;
  reference: string;
  walletAddress: string;
  note: string;
  createdAt: string;
}
