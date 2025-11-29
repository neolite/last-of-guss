import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  signToken,
  getRoleFromUsername,
} from "../utils/auth.js";

const loginSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "Invalid input" });
    }

    const { username, password } = parseResult.data;

    const existingUser = await db.query.users.findFirst({
      where: eq(schema.users.username, username),
    });

    if (existingUser) {
      const validPassword = await verifyPassword(password, existingUser.passwordHash);
      if (!validPassword) {
        return reply.status(401).send({ error: "Invalid password" });
      }

      const token = signToken({
        userId: existingUser.id,
        username: existingUser.username,
        role: existingUser.role,
      });

      reply.setCookie("token", token, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });

      return reply.send({
        id: existingUser.id,
        username: existingUser.username,
        role: existingUser.role,
      });
    }

    const role = getRoleFromUsername(username);
    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(schema.users)
      .values({ username, passwordHash, role })
      .returning();

    const token = signToken({
      userId: newUser.id,
      username: newUser.username,
      role: newUser.role,
    });

    reply.setCookie("token", token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return reply.status(201).send({
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
    });
  });

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie("token", { path: "/" });
    return reply.send({ success: true });
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.send({
      id: request.user!.userId,
      username: request.user!.username,
      role: request.user!.role,
    });
  });
}
