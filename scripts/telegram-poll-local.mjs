import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const localBackendUrl = process.env.LOCAL_BACKEND_URL ?? "http://localhost:8080";
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in cartpilot/backend/.env");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function telegramRequest(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(payload)}`);
  }

  return payload.result;
}

const webhookInfo = await telegramRequest("getWebhookInfo", {});
if (webhookInfo.url) {
  console.error(
    `Telegram currently has an active webhook set to ${webhookInfo.url}. Delete it first with "pnpm --filter @cartpilot/backend telegram:webhook:delete" before using local polling.`,
  );
  process.exit(1);
}

console.log(`Polling Telegram and forwarding updates to ${localBackendUrl}/api/webhooks/telegram`);

let offset = 0;

while (true) {
  try {
    const updates = await telegramRequest("getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message", "business_message", "callback_query"],
    });

    for (const update of updates) {
      const response = await fetch(`${localBackendUrl}/api/webhooks/telegram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret
            ? { "x-telegram-bot-api-secret-token": webhookSecret }
            : {}),
        },
        body: JSON.stringify(update),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Local backend rejected update ${update.update_id}: ${response.status} ${body}`);
      }

      offset = update.update_id + 1;
      const source = update.message ?? update.business_message ?? update.callback_query;
      const label = source?.text ?? source?.data ?? "<non-text update>";
      console.log(`Forwarded update ${update.update_id}: ${label}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await sleep(3000);
  }
}
