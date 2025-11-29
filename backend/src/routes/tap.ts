import type { FastifyInstance } from "fastify";
import pg from "pg";

// Reuse pool across requests
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function tapRoutes(app: FastifyInstance): Promise<void> {
  app.post("/rounds/:id/tap", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: roundId } = request.params as { id: string };
    const userId = request.user!.userId;
    const isNikita = request.user!.role === "nikita";

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Check if round is active (lock row to prevent concurrent modifications)
      const roundResult = await client.query(
        `SELECT id, start_at, end_at FROM rounds WHERE id = $1 FOR UPDATE`,
        [roundId]
      );

      if (roundResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return reply.status(404).send({ error: "Round not found" });
      }

      const round = roundResult.rows[0];
      const now = new Date();

      if (now < round.start_at || now > round.end_at) {
        await client.query("ROLLBACK");
        return reply.status(400).send({ error: "Round is not active" });
      }

      // 2. For nikita - process request but don't actually count
      if (isNikita) {
        await client.query("COMMIT");
        return reply.send({ taps: 0, score: 0 });
      }

      // 3. Atomic upsert + increment using single query
      // This handles race condition on INSERT by using ON CONFLICT
      // and calculates points correctly using the NEW taps value
      const tapResult = await client.query(
        `INSERT INTO player_rounds (id, round_id, user_id, taps, score)
         VALUES (gen_random_uuid(), $1, $2, 1, 1)
         ON CONFLICT (user_id, round_id) DO UPDATE SET
           taps = player_rounds.taps + 1,
           score = player_rounds.score + CASE 
             WHEN (player_rounds.taps + 1) % 11 = 0 THEN 10 
             ELSE 1 
           END
         RETURNING taps, score`,
        [roundId, userId]
      );

      const { taps: newTaps, score: newScore } = tapResult.rows[0];

      // 4. Calculate points earned for this tap
      const pointsEarned = newTaps % 11 === 0 ? 10 : 1;

      // 5. Update round total score atomically
      await client.query(
        `UPDATE rounds SET total_score = total_score + $1 WHERE id = $2`,
        [pointsEarned, roundId]
      );

      await client.query("COMMIT");

      return reply.send({ taps: newTaps, score: newScore });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
