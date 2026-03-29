import {
  MerchantOfferSnapshot,
  MerchantRawOffer,
  MerchantSearchMode,
  MerchantSearchRequest,
} from "@/domain/types";

export interface MerchantSearchResponse {
  merchant: string;
  mode: MerchantSearchMode;
  query: string;
  offers: MerchantRawOffer[];
  warnings?: string[];
  searchUrl?: string;
}

export interface MerchantAdapter {
  readonly merchant: string;
  readonly mode: MerchantSearchMode;
  searchProducts(request: MerchantSearchRequest): Promise<MerchantSearchResponse>;
  getOfferDetails(offerId: string): Promise<MerchantOfferSnapshot | null>;
  checkAvailability(offerId: string, destination: string): Promise<{ available: boolean; detail: string }>;
}
