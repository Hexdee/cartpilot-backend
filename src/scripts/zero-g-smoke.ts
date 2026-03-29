import { MerchantRawOffer } from "../domain/types";
import { ZeroGAiProvider } from "../services/ai/zero-g-ai-provider";
import { ZeroGComputeClient } from "../services/ai/zero-g-compute-client";

async function main() {
  const computeClient = new ZeroGComputeClient();
  if (!computeClient.isConfigured()) {
    throw new Error(
      "ZERO_G_PRIVATE_KEY is not configured. Set ZERO_G_PRIVATE_KEY, ZERO_G_RPC_URL, and ZERO_G_PROVIDER_ADDRESS before running zero-g:test.",
    );
  }

  const ai = new ZeroGAiProvider();
  const prompt = "Find the best rated black Sony WH-1000XM5 under 700000 naira";
  const intent = await ai.parseSearchIntent(prompt, [prompt]);

  const rawOffers: MerchantRawOffer[] = [
    {
      id: "jumia-live-smoke",
      merchant: "Jumia",
      sourceUrl: "https://www.jumia.com.ng/catalog/?q=sony+wh1000xm5",
      title: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones Black",
      summary: "Official Jumia listing",
      priceText: "₦648,000",
      shippingText: "₦15,500",
      ratingText: "4.8 out of 5",
      availabilityText: "In stock",
      officialStore: true,
      color: "black",
    },
    {
      id: "konga-live-smoke",
      merchant: "Konga",
      sourceUrl: "https://www.konga.com/search?search=sony+wh1000xm5",
      title: "Sony WH-1000XM5 Bluetooth Headphones",
      summary: "Marketplace listing",
      priceText: "₦639,900",
      shippingText: "₦22,000",
      ratingText: "4.7",
      availabilityText: "In stock",
      officialStore: false,
      color: "black",
    },
  ];

  const normalized = await ai.normalizeMerchantOffers(intent, rawOffers);

  console.log(
    JSON.stringify(
      {
        intent,
        normalized,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
