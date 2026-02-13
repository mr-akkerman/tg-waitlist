import { pgTable, uuid, bigint, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_waitlist_telegram_user_id").on(table.telegramUserId),
  uniqueIndex("idx_unique_user_email").on(table.telegramUserId, table.email),
]);
