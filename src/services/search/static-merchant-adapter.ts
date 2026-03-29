import { getOfferSeed, seedSnapshotToRawOffer } from "@/domain/catalog";
import { MerchantOfferSnapshot, MerchantSearchMode, MerchantSearchRequest } from "@/domain/types";
import { MerchantAdapter, MerchantSearchResponse } from "@/services/search/merchant-adapter";

export class StaticMerchantAdapter implements MerchantAdapter {
  readonly mode: MerchantSearchMode = "seed";

  constructor(public readonly merchant: string) {}

  async searchProducts(request: MerchantSearchRequest): Promise<MerchantSearchResponse> {
    return {
      merchant: this.merchant,
      mode: "seed",
      query: request.query,
      offers: getOfferSeed(request.productKey)
        .filter((offer) => offer.merchant === this.merchant)
        .map(seedSnapshotToRawOffer),
    };
  }

  async getOfferDetails(offerId: string): Promise<MerchantOfferSnapshot | null> {
    const match = getOfferSeed("sony_wh1000xm5")
      .concat(getOfferSeed("office_chair"))
      .concat(getOfferSeed("portable_blender"))
      .concat(getOfferSeed("ps5_controller"))
      .concat(getOfferSeed("air_fryer"))
      .find((offer) => offer.id === offerId && offer.merchant === this.merchant);
    return match ?? null;
  }

  async checkAvailability(offerId: string, destination: string) {
    const details = await this.getOfferDetails(offerId);
    return {
      available: Boolean(details),
      detail: details
        ? `Offer is available for delivery to ${destination}.`
        : "Offer is not currently available.",
    };
  }
}
