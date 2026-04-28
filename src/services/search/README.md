# Live Merchant Adapter Architecture

CartPilot now separates merchant retrieval from AI reasoning:

- `LiveMerchantAdapter`
  Fetches merchant HTML and parses raw merchant offers.
- `AiProvider.normalizeMerchantOffers`
  Converts raw merchant offers into canonical `MerchantOfferSnapshot` records.
- `SearchService`
  Aggregates adapter output, normalizes offers, ranks them, and produces the explanation.

Recommended modes:

- `seed`
  Use the seeded catalog only.
- `live`
  Use live merchant HTML only.
- `hybrid`
  Try live merchant HTML first and fall back to the seeded catalog if parsing fails.

Current adapters:

- `JumiaMerchantAdapter`
- `KongaMerchantAdapter`
- `JijiMerchantAdapter`
- `AliExpressMerchantAdapter`
- `TemuMerchantAdapter`

Runtime configuration:

- `MERCHANT_SEARCH_MODE=seed|live|hybrid`
- `MERCHANTS_ENABLED=jumia,konga,jiji,aliexpress,temu` (comma-separated)

Current AI responsibilities:

- parse search intent
- normalize live merchant offers into canonical offer snapshots
- explain ranking

AI does not crawl merchant websites. Crawling remains inside merchant adapters.
