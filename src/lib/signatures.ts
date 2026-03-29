import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyHmacSignature(
  signatureHeader: string | undefined,
  secret: string | undefined,
  payload: Buffer,
): boolean {
  if (!signatureHeader || !secret) return false;

  const normalized = signatureHeader.replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(normalized), Buffer.from(expected));
  } catch {
    return false;
  }
}
