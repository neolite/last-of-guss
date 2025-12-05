import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { config } from "./utils/config.js";
import { authMiddleware, adminMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { roundsRoutes } from "./routes/rounds.js";
import { tapRoutes } from "./routes/tap.js";
import { GameServer } from "./game/GameServer.js";
import type { JwtPayload } from "./utils/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authMiddleware;
    adminOnly: typeof adminMiddleware;
  }
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

async function main(): Promise<void> {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: /^http:\/\/localhost:\d+$/,  // Allow any localhost port
    credentials: true,
  });

  await app.register(cookie);

  // Decorate with auth methods
  app.decorate("authenticate", authMiddleware);
  app.decorate("adminOnly", adminMiddleware);

  // Register routes
  await app.register(authRoutes);
  await app.register(roundsRoutes);
  await app.register(tapRoutes);

  // Initialize WebSocket game server
  const gameServer = new GameServer(app);
  await gameServer.initialize();

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`Server running on port ${config.port}`);
    console.log(`WebSocket game server ready at ws://localhost:${config.port}/ws/game`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
