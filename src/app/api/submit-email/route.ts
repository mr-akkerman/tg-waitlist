import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { waitlistEntries } from "@/db/schema";
import { eq, count } from "drizzle-orm";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ENTRIES_PER_USER = 10;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { telegram_user_id, email } = body;

    if (!telegram_user_id || typeof telegram_user_id !== "number" || telegram_user_id <= 0) {
      return NextResponse.json(
        { error: "telegram_user_id is required and must be a positive number" },
        { status: 400 }
      );
    }

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

    const [result] = await getDb()
      .select({ count: count() })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.telegramUserId, telegram_user_id));

    if (result.count >= MAX_ENTRIES_PER_USER) {
      return NextResponse.json(
        { error: "Maximum number of email entries reached (10)" },
        { status: 429 }
      );
    }

    const [entry] = await getDb()
      .insert(waitlistEntries)
      .values({
        telegramUserId: telegram_user_id,
        email: trimmedEmail,
      })
      .returning();

    return NextResponse.json({ success: true, id: entry.id }, { status: 201 });
  } catch (error) {
    console.error("Failed to submit email:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
