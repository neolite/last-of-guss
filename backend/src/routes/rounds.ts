import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";
import { eq, gte, desc, sql } from "drizzle-orm";
import { config } from "../utils/config.js";

export async function roundsRoutes(app: FastifyInstance): Promise<void> {
  // Get list of active and upcoming rounds
  app.get("/rounds", { preHandler: [app.authenticate] }, async (_request, reply) => {
    const now = new Date();

    const rounds = await db.query.rounds.findMany({
      where: gte(schema.rounds.endAt, now),
      orderBy: [desc(schema.rounds.startAt)],
    });

    const roundsWithStatus = rounds.map((round) => ({
      ...round,
      status: getStatus(round.startAt, round.endAt),
    }));

    return reply.send(roundsWithStatus);
  });

  // Create a new round (admin only)
  app.post("/rounds", { preHandler: [app.adminOnly] }, async (_request, reply) => {
    const now = new Date();
    const startAt = new Date(now.getTime() + config.cooldownDuration * 1000);
    const endAt = new Date(startAt.getTime() + config.roundDuration * 1000);

    const [round] = await db
      .insert(schema.rounds)
      .values({ startAt, endAt })
      .returning();

    return reply.status(201).send({
      ...round,
      status: getStatus(round.startAt, round.endAt),
    });
  });

  // Get round details
  app.get("/rounds/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const round = await db.query.rounds.findFirst({
      where: eq(schema.rounds.id, id),
    });

    if (!round) {
      return reply.status(404).send({ error: "Round not found" });
    }

    const status = getStatus(round.startAt, round.endAt);

    // Get player's score in this round
    const playerRound = await db.query.playerRounds.findFirst({
      where:
        sql`${schema.playerRounds.roundId} = ${id} AND ${schema.playerRounds.userId} = ${request.user!.userId}`,
    });

    // For nikita, show zeros
    const isNikita = request.user!.role === "nikita";
    const myTaps = isNikita ? 0 : (playerRound?.taps ?? 0);
    const myScore = isNikita ? 0 : (playerRound?.score ?? 0);

    // Get leaderboard and winner if round is finished
    let winner = null;
    let leaderboard: { rank: number; username: string; score: number; isMe: boolean }[] = [];
    
    if (status === "finished") {
      const allPlayers = await db.query.playerRounds.findMany({
        where: eq(schema.playerRounds.roundId, id),
        orderBy: [desc(schema.playerRounds.score)],
        with: {
          user: true,
        },
      });

      leaderboard = allPlayers.map((p, index) => ({
        rank: index + 1,
        username: p.user.username,
        score: p.user.role === "nikita" ? 0 : p.score,
        isMe: p.userId === request.user!.userId,
      }));

      // Winner is first place (excluding nikita with 0 score)
      const topPlayer = leaderboard.find(p => p.score > 0);
      if (topPlayer) {
        winner = {
          username: topPlayer.username,
          score: topPlayer.score,
        };
      }
    }

    return reply.send({
      ...round,
      status,
      myTaps,
      myScore,
      winner,
      leaderboard,
    });
  });
}

function getStatus(
  startAt: Date,
  endAt: Date
): "cooldown" | "active" | "finished" {
  const now = new Date();
  if (now < startAt) return "cooldown";
  if (now >= startAt && now <= endAt) return "active";
  return "finished";
}
