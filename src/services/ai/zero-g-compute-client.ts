import { ethers } from "ethers";
import {
  createZGComputeNetworkBroker,
  ZGComputeNetworkBroker,
} from "@0glabs/0g-serving-broker";
import OpenAI from "openai";
import { env } from "@/config/env";

export const OFFICIAL_ZERO_G_TESTNET_PROVIDER = {
  model: "openai/gpt-oss-20b",
  providerAddress: "0x8e60d466FD16798Bec4868aa4CE38586D5590049",
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export class ZeroGComputeClient {
  private brokerPromise: Promise<ZGComputeNetworkBroker> | null = null;

  isConfigured() {
    return Boolean(env.ZERO_G_PRIVATE_KEY);
  }

  async runChat(messages: ChatMessage[]) {
    if (!this.isConfigured()) {
      throw new Error("ZERO_G_PRIVATE_KEY is not configured.");
    }

    const broker = await this.getBroker();
    const providerAddress =
      env.ZERO_G_PROVIDER_ADDRESS ?? OFFICIAL_ZERO_G_TESTNET_PROVIDER.providerAddress;
    const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
    const promptFingerprint = messages.map((entry) => `${entry.role}:${entry.content}`).join("\n");
    const headerSource = promptFingerprint.slice(0, 6000);
    const authHeaders = await broker.inference.getRequestHeaders(providerAddress, headerSource);

    const openai = new OpenAI({
      baseURL: endpoint,
      apiKey: "",
    });

    const requestHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(authHeaders)) {
      if (typeof value === "string") {
        requestHeaders[key] = value;
      }
    }

    const completion = await openai.chat.completions.create(
      {
        model,
        temperature: 0,
        messages,
      },
      {
        headers: requestHeaders,
      },
    );

    const rawContent = completion.choices[0]?.message?.content as
      | string
      | Array<{ text?: string }>
      | undefined;
    const content =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((entry) =>
                typeof entry === "object" && entry && "text" in entry ? entry.text ?? "" : "",
              )
              .join("")
          : "";

    await broker.inference.processResponse(providerAddress, completion.id, content);

    return {
      providerAddress,
      endpoint,
      model,
      content,
      id: completion.id,
    };
  }

  private async getBroker() {
    if (!this.brokerPromise) {
      this.brokerPromise = this.createBroker();
    }

    return this.brokerPromise;
  }

  private async createBroker() {
    const privateKey = env.ZERO_G_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("ZERO_G_PRIVATE_KEY is not configured.");
    }

    const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(env.ZERO_G_RPC_URL);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    return createZGComputeNetworkBroker(wallet);
  }
}
