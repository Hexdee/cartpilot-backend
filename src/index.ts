import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      publicBaseUrl: env.PUBLIC_BASE_URL,
      webBaseUrl: env.WEB_BASE_URL,
    },
    "CartPilot backend is running.",
  );
});
