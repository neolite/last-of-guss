import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";
import { eq, and, or, sql } from "drizzle-orm";

// Funny session name generator
function generateSessionName(): string {
  const subjects = [
    "Помидоры", "Огурцы", "Бананы", "Яблоки", "Арбузы", "Картошка",
    "Морковки", "Капуста", "Лук", "Чеснок", "Перцы", "Баклажаны",
    "Кабачки", "Тыквы", "Редиска", "Свёкла", "Груши", "Апельсины",
    "Мандарины", "Лимоны", "Ананасы", "Киви", "Авокадо", "Манго"
  ];

  const adjectives = [
    "Злые", "Добрые", "Весёлые", "Грустные", "Быстрые", "Медленные",
    "Сильные", "Слабые", "Умные", "Хитрые", "Смелые", "Трусливые",
    "Голодные", "Сытые", "Ленивые", "Активные", "Дикие", "Домашние"
  ];

  const subject1 = subjects[Math.floor(Math.random() * subjects.length)];
  let subject2 = subjects[Math.floor(Math.random() * subjects.length)];

  // Ensure different subjects
  while (subject2 === subject1) {
    subject2 = subjects[Math.floor(Math.random() * subjects.length)];
  }

  const adj1 = adjectives[Math.floor(Math.random() * adjectives.length)];
  const adj2 = adjectives[Math.floor(Math.random() * adjectives.length)];

  return `${adj1} ${subject1} против ${adj2} ${subject2}`;
}

export async function sessionsRoutes(app: FastifyInstance): Promise<void> {
  // Get list of all active sessions (waiting, countdown, active)
  app.get("/sessions", async (_request, reply) => {
    const sessions = await db.query.gameSessions.findMany({
      where: or(
        eq(schema.gameSessions.status, "waiting"),
        eq(schema.gameSessions.status, "countdown"),
        eq(schema.gameSessions.status, "active")
      ),
      orderBy: [sql`${schema.gameSessions.createdAt} DESC`],
    });

    return reply.send(sessions);
  });

  // Create new session
  app.post<{
    Body: { name?: string; maxPlayers?: number };
  }>("/sessions", async (request, reply) => {
    const { name, maxPlayers = 8 } = request.body;

    // Auto-generate name if not provided
    const sessionName = name && name.trim().length > 0
      ? name.trim()
      : generateSessionName();

    if (maxPlayers < 2 || maxPlayers > 16) {
      return reply.status(400).send({ error: "Max players must be between 2 and 16" });
    }

    const [session] = await db
      .insert(schema.gameSessions)
      .values({
        name: sessionName,
        maxPlayers,
        currentPlayers: 0,
        status: "waiting",
      })
      .returning();

    return reply.status(201).send(session);
  });

  // Get session details
  app.get<{
    Params: { id: string };
  }>("/sessions/:id", async (request, reply) => {
    const { id } = request.params;

    const session = await db.query.gameSessions.findFirst({
      where: eq(schema.gameSessions.id, id),
    });

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    return reply.send(session);
  });

  // Join session (increment player count)
  app.post<{
    Params: { id: string };
  }>("/sessions/:id/join", async (request, reply) => {
    const { id } = request.params;

    const session = await db.query.gameSessions.findFirst({
      where: eq(schema.gameSessions.id, id),
    });

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (session.status !== "waiting" && session.status !== "countdown") {
      return reply.status(400).send({ error: "Cannot join session in current state" });
    }

    if (session.currentPlayers >= session.maxPlayers) {
      return reply.status(400).send({ error: "Session is full" });
    }

    const [updatedSession] = await db
      .update(schema.gameSessions)
      .set({
        currentPlayers: session.currentPlayers + 1,
        // Auto-start countdown if we have 2+ players
        status: session.currentPlayers + 1 >= 2 ? "countdown" : "waiting",
      })
      .where(eq(schema.gameSessions.id, id))
      .returning();

    return reply.send(updatedSession);
  });

  // Leave session (decrement player count)
  app.post<{
    Params: { id: string };
  }>("/sessions/:id/leave", async (request, reply) => {
    const { id } = request.params;

    const session = await db.query.gameSessions.findFirst({
      where: eq(schema.gameSessions.id, id),
    });

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (session.currentPlayers <= 0) {
      return reply.status(400).send({ error: "No players in session" });
    }

    const newPlayerCount = session.currentPlayers - 1;

    // If no players left, delete the session
    if (newPlayerCount === 0) {
      await db
        .delete(schema.gameSessions)
        .where(eq(schema.gameSessions.id, id));

      return reply.send({ deleted: true });
    }

    const [updatedSession] = await db
      .update(schema.gameSessions)
      .set({
        currentPlayers: newPlayerCount,
        // Go back to waiting if < 2 players
        status: newPlayerCount < 2 ? "waiting" : session.status,
      })
      .where(eq(schema.gameSessions.id, id))
      .returning();

    return reply.send(updatedSession);
  });

  // Start session (change status to active)
  app.post<{
    Params: { id: string };
  }>("/sessions/:id/start", async (request, reply) => {
    const { id } = request.params;

    const session = await db.query.gameSessions.findFirst({
      where: eq(schema.gameSessions.id, id),
    });

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (session.status !== "countdown") {
      return reply.status(400).send({ error: "Session must be in countdown state to start" });
    }

    const [updatedSession] = await db
      .update(schema.gameSessions)
      .set({
        status: "active",
        startedAt: new Date(),
      })
      .where(eq(schema.gameSessions.id, id))
      .returning();

    return reply.send(updatedSession);
  });

  // End session (change status to finished)
  app.post<{
    Params: { id: string };
  }>("/sessions/:id/end", async (request, reply) => {
    const { id } = request.params;

    const session = await db.query.gameSessions.findFirst({
      where: eq(schema.gameSessions.id, id),
    });

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (session.status !== "active") {
      return reply.status(400).send({ error: "Session must be active to end" });
    }

    const [updatedSession] = await db
      .update(schema.gameSessions)
      .set({
        status: "finished",
        endedAt: new Date(),
      })
      .where(eq(schema.gameSessions.id, id))
      .returning();

    return reply.send(updatedSession);
  });
}
