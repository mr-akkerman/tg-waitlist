import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { validateInitData } from "@/lib/telegram-auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ENTRIES_PER_USER = 10;
const MAX_BODY_SIZE = 2048; // 2KB — enough for initData + email

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.push(process.env.NEXT_PUBLIC_APP_URL);
  }
  if (process.env.PROXY_DOMAIN) {
    origins.push(`https://${process.env.PROXY_DOMAIN}`);
  }
  return origins;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowed = getAllowedOrigins();

  if (allowed.length > 0 && !allowed.includes(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: Request) {
  try {
    // --- VULN-006 fix: validate Content-Type ---
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return NextResponse.json(
        { error: "Unsupported content type" },
        { status: 415 }
      );
    }

    // --- VULN-007 fix: reject oversized payloads ---
    const contentLength = parseInt(request.headers.get("content-length") || "0");
    if (contentLength > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Payload too large" },
        { status: 413 }
      );
    }

    // --- VULN-004 fix: check Origin ---
    const origin = request.headers.get("origin");
    const allowedOrigins = getAllowedOrigins();
    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { initData, email } = body;

    // --- 1. Validate Telegram initData signature (VULN-001 fix) ---
    if (!initData || typeof initData !== "string") {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN is not configured");
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    let telegramUserId: number;
    try {
      const { user } = validateInitData(initData, botToken);
      telegramUserId = user.id;
    } catch {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 403 }
      );
    }

    // --- 2. Validate email ---
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // --- 3. Atomic INSERT with limit check (VULN-002 fix) ---
    const result = await getDb().execute(sql`
      INSERT INTO waitlist_entries (telegram_user_id, email)
      SELECT ${telegramUserId}, ${trimmedEmail}
      WHERE (
        SELECT count(*) FROM waitlist_entries
        WHERE telegram_user_id = ${telegramUserId}
      ) < ${MAX_ENTRIES_PER_USER}
      RETURNING id
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Submission limit reached" },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { success: true, id: result.rows[0].id },
      { status: 201 }
    );
  } catch (error: unknown) {
    // --- VULN-005 fix: handle unique constraint violation ---
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "This email has already been submitted" },
        { status: 409 }
      );
    }

    console.error(
      "Failed to submit email:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
