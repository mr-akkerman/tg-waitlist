import { createHmac } from "crypto";

const MAX_AUTH_AGE_SECONDS = 300; // 5 minutes

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function validateInitData(
  initData: string,
  botToken: string
): { user: TelegramUserData; authDate: number } {
  if (!initData) {
    throw new Error("initData is empty");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    throw new Error("hash is missing from initData");
  }

  // Build data-check-string: sort params by key, exclude hash
  params.delete("hash");
  const entries: string[] = [];
  params.forEach((value, key) => {
    entries.push(`${key}=${value}`);
  });
  entries.sort();
  const dataCheckString = entries.join("\n");

  // HMAC-SHA256 verification per Telegram docs
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) {
    throw new Error("Invalid initData signature");
  }

  // Check auth_date freshness
  const authDate = parseInt(params.get("auth_date") || "0", 10);
  const now = Math.floor(Date.now() / 1000);

  if (now - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new Error("initData is expired");
  }

  // Parse user
  const userStr = params.get("user");
  if (!userStr) {
    throw new Error("user data not found in initData");
  }

  const user: TelegramUserData = JSON.parse(userStr);
  if (!user.id || typeof user.id !== "number") {
    throw new Error("invalid user id in initData");
  }

  return { user, authDate };
}
