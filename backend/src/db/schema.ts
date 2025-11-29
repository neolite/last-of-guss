import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["admin", "survivor", "nikita"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("survivor"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rounds = pgTable("rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  totalScore: integer("total_score").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const playerRounds = pgTable(
  "player_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id),
    taps: integer("taps").notNull().default(0),
    score: integer("score").notNull().default(0),
  },
  (table) => [uniqueIndex("player_round_unique_idx").on(table.userId, table.roundId)]
);

// Relations for Drizzle query API
export const usersRelations = relations(users, ({ many }) => ({
  playerRounds: many(playerRounds),
}));

export const roundsRelations = relations(rounds, ({ many }) => ({
  playerRounds: many(playerRounds),
}));

export const playerRoundsRelations = relations(playerRounds, ({ one }) => ({
  user: one(users, {
    fields: [playerRounds.userId],
    references: [users.id],
  }),
  round: one(rounds, {
    fields: [playerRounds.roundId],
    references: [rounds.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type PlayerRound = typeof playerRounds.$inferSelect;
export type NewPlayerRound = typeof playerRounds.$inferInsert;
export type UserRole = "admin" | "survivor" | "nikita";
