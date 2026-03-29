import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in cartpilot/backend/.env");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
const payload = await response.json();

if (!response.ok || !payload.ok) {
  console.error("Telegram getMe failed.");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(payload.result, null, 2));
