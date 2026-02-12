import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { validateInitData } from "@/lib/telegram-auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ENTRIES_PER_USER = 10;

export async function POST(request: Request) {
  try {
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
  } catch (error) {
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
