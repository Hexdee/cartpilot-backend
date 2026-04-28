import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/config/env";
import { MerchantRawOffer } from "@/domain/types";

type SearchDebugSnapshotInput = {
  merchant: string;
  query: string;
  searchUrl: string;
  phase: "http_fetch" | "browser_fallback" | "error";
  html?: string;
  offers?: MerchantRawOffer[];
  warnings?: string[];
  error?: string;
};

function slugify(input: string, maxLength = 48) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    || "n-a";
}

export async function writeSearchDebugSnapshot(snapshot: SearchDebugSnapshotInput) {
  if (!env.SEARCH_DEBUG_WRITE_ENABLED) {
    return;
  }

  try {
    await mkdir(env.SEARCH_DEBUG_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const baseName = [
      timestamp,
      slugify(snapshot.merchant, 24),
      slugify(snapshot.query, 40),
      snapshot.phase,
      randomSuffix,
    ].join("__");

    const metadataPath = join(env.SEARCH_DEBUG_DIR, `${baseName}.json`);
    const htmlPath = join(env.SEARCH_DEBUG_DIR, `${baseName}.html`);

    const payload = {
      timestamp: new Date().toISOString(),
      merchant: snapshot.merchant,
      query: snapshot.query,
      searchUrl: snapshot.searchUrl,
      phase: snapshot.phase,
      htmlLength: snapshot.html?.length ?? 0,
      offerCount: snapshot.offers?.length ?? 0,
      warnings: snapshot.warnings ?? [],
      error: snapshot.error,
      offers: snapshot.offers ?? [],
    };

    await writeFile(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    if (snapshot.html) {
      await writeFile(htmlPath, snapshot.html, "utf8");
    }
  } catch {
    // Debug logging must never crash search flow.
  }
}
