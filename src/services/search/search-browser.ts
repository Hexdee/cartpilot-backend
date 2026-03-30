import { env } from "@/config/env";

type SearchBrowserOptions = {
  timeoutMs: number;
  userAgent: string;
  waitForSelector?: string | null;
};

export type BrowserAnchorCandidate = {
  href: string;
  text: string;
  title?: string;
  imageUrl?: string;
};

export async function renderSearchPageHtml(url: string, options: SearchBrowserOptions) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    executablePath: env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: options.userAgent,
      viewport: { width: 1440, height: 1600 },
      locale: "en-NG",
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });

    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, {
        timeout: options.timeoutMs,
        state: "attached",
      }).catch(() => undefined);
    } else {
      await page.waitForLoadState("networkidle", { timeout: options.timeoutMs }).catch(() => undefined);
    }

    await page.mouse.wheel(0, 1600).catch(() => undefined);
    await page.waitForTimeout(5000);

    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function scrapeRenderedAnchors(
  url: string,
  options: SearchBrowserOptions & { selector: string; limit?: number },
) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    executablePath: env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: options.userAgent,
      viewport: { width: 1440, height: 1600 },
      locale: "en-NG",
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });

    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, {
        timeout: options.timeoutMs,
        state: "attached",
      }).catch(() => undefined);
    }

    await page.waitForTimeout(5000);

    return await page
      .locator(options.selector)
      .evaluateAll(
        (elements, limit) =>
          elements
            .slice(0, limit)
            .map((element) => {
              const image = element.querySelector("img");
              return {
                href: element.getAttribute("href") || "",
                text: (element.textContent || "").replace(/\s+/g, " ").trim(),
                title:
                  element.getAttribute("title")
                  || image?.getAttribute("alt")
                  || "",
                imageUrl:
                  image?.getAttribute("src")
                  || image?.getAttribute("data-src")
                  || image?.getAttribute("data-lazy-src")
                  || "",
              };
            })
            .filter((entry) => entry.href || entry.text),
        options.limit ?? 500,
      ) as BrowserAnchorCandidate[];
  } finally {
    await browser.close();
  }
}
