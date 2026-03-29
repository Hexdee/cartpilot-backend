import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!accessToken) {
  console.error("Missing WHATSAPP_ACCESS_TOKEN in cartpilot/backend/.env");
  process.exit(1);
}

if (!phoneNumberId) {
  console.error("Missing WHATSAPP_PHONE_NUMBER_ID in cartpilot/backend/.env");
  process.exit(1);
}

const url = new URL(`https://graph.facebook.com/v23.0/${phoneNumberId}`);
url.searchParams.set("fields", "display_phone_number,verified_name");

const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
const payload = await response.json();

if (!response.ok || payload.error) {
  console.error("WhatsApp config check failed.");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));
