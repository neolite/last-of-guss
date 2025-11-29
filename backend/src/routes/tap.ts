import type { FastifyInstance } from "fastify";
import pg from "pg";

export async function tapRoutes(app: FastifyInstance): Promise<void> {
  app.post("/rounds/:id/tap", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: roundId } = request.params as { id: string };
      const userId = request.user!.userId;
      const isNikita = request.user!.role === "nikita";

      // Use raw SQL transaction with FOR UPDATE to handle race conditions
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
      });

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Check if round is active with row lock
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

        // For nikita - process request but don't actually count
        if (isNikita) {
          await client.query("COMMIT");
          return reply.send({ taps: 0, score: 0 });
        }

        // Get or create player_round with lock
        let playerRoundResult = await client.query(
          `SELECT id, taps, score FROM player_rounds 
           WHERE round_id = $1 AND user_id = $2 FOR UPDATE`,
          [roundId, userId]
        );

        let currentTaps: number;
        let currentScore: number;

        if (playerRoundResult.rows.length === 0) {
          // Create new player_round
          const insertResult = await client.query(
            `INSERT INTO player_rounds (id, round_id, user_id, taps, score)
             VALUES (gen_random_uuid(), $1, $2, 0, 0)
             RETURNING id, taps, score`,
            [roundId, userId]
          );
          currentTaps = 0;
          currentScore = 0;
          playerRoundResult = insertResult;
        } else {
          currentTaps = playerRoundResult.rows[0].taps;
          currentScore = playerRoundResult.rows[0].score;
        }

        // Calculate new values
        const newTaps = currentTaps + 1;
        // Every 11th tap gives 10 points, otherwise 1 point
        const pointsEarned = newTaps % 11 === 0 ? 10 : 1;
        const newScore = currentScore + pointsEarned;

        // Update player_round
        await client.query(
          `UPDATE player_rounds SET taps = $1, score = $2 WHERE round_id = $3 AND user_id = $4`,
          [newTaps, newScore, roundId, userId]
        );

        // Update round total score
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
        await pool.end();
      }
    }
  );
}
