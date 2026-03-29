import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const publicBaseUrl = process.env.PUBLIC_BASE_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in cartpilot/backend/.env");
  process.exit(1);
}

if (!publicBaseUrl) {
  console.error("Missing PUBLIC_BASE_URL in cartpilot/backend/.env");
  process.exit(1);
}

const webhookUrl = new URL("/api/webhooks/telegram", publicBaseUrl).toString();
const body = webhookSecret
  ? { url: webhookUrl, secret_token: webhookSecret }
  : { url: webhookUrl };

const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const payload = await response.json();

if (!response.ok || !payload.ok) {
  console.error("Telegram setWebhook failed.");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      webhookUrl,
      description: payload.description,
      usedSecret: Boolean(webhookSecret),
    },
    null,
    2,
  ),
);
