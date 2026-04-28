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

const merchantSearchMode = z.enum(["seed", "live", "hybrid"]).default("live");

const merchantList = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return ["jumia", "konga", "jiji"];
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : ["jumia", "konga", "jiji"];
}, z.array(z.enum(["jumia", "konga", "jiji", "aliexpress", "temu"])));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:8080"),
  MERCHANT_HTTP_TIMEOUT_MS: z.coerce.number().default(12000),
  MERCHANT_BROWSER_TIMEOUT_MS: z.coerce.number().default(20000),
  MERCHANT_BROWSER_AUTOMATION_ENABLED: booleanFlag,
  MERCHANT_USER_AGENT: z.string().default("CartPilotBot/1.0 (+https://cartpilot.local)"),
  SEARCH_DEBUG_WRITE_ENABLED: booleanFlag,
  SEARCH_DEBUG_DIR: z.string().default("debug/search"),
  MERCHANT_SEARCH_MODE: merchantSearchMode,
  MERCHANTS_ENABLED: merchantList,
  PLAYWRIGHT_EXECUTABLE_PATH: optionalString,
  REMOTE_FALLBACK_BASE_URL: z.string().url().default("https://cartpilot.onrender.com"),
  JUMIA_SEARCH_BASE_URL: z.string().url().default("https://www.jumia.com.ng/catalog/"),
  KONGA_SEARCH_BASE_URL: z.string().url().default("https://www.konga.com/search"),
  JIJI_SEARCH_BASE_URL: z.string().url().default("https://jiji.ng/search"),
  TEMU_SEARCH_BASE_URL: z.string().url().default("https://www.temu.com/search_result.html"),
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
