import { config } from "dotenv";
import { z } from "zod";

config();

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const booleanFlag = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  return value;
}, z.boolean().default(false));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:8080"),
  MERCHANT_HTTP_TIMEOUT_MS: z.coerce.number().default(12000),
  MERCHANT_BROWSER_TIMEOUT_MS: z.coerce.number().default(20000),
  MERCHANT_BROWSER_AUTOMATION_ENABLED: booleanFlag,
  MERCHANT_USER_AGENT: z.string().default("CartPilotBot/1.0 (+https://cartpilot.local)"),
  PLAYWRIGHT_EXECUTABLE_PATH: optionalString,
  JUMIA_SEARCH_BASE_URL: z.string().url().default("https://www.jumia.com.ng/catalog/"),
  KONGA_SEARCH_BASE_URL: z.string().url().default("https://www.konga.com/search"),
  ADMIN_API_TOKEN: z.string().default("change-me"),
  JWT_SECRET: z.string().default("change-me"),
  WHATSAPP_VERIFY_TOKEN: z.string().default("change-me"),
  WHATSAPP_APP_SECRET: optionalString,
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  TELEGRAM_WEBHOOK_SECRET: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  REDIS_URL: optionalUrl,
  DATABASE_URL: optionalString,
  ZERO_G_PRIVATE_KEY: optionalString,
  ZERO_G_RPC_URL: z.string().url().default("https://evmrpc-testnet.0g.ai"),
  ZERO_G_PROVIDER_ADDRESS: optionalString,
});

export const env = envSchema.parse(process.env);
