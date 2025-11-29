import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken, type JwtPayload } from "../utils/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies.token;

  if (!token) {
    reply.status(401).send({ error: "Unauthorized" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    reply.status(401).send({ error: "Invalid token" });
    return;
  }

  request.user = payload;
}

export async function adminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authMiddleware(request, reply);
  if (reply.sent) return;

  if (request.user?.role !== "admin") {
    reply.status(403).send({ error: "Admin access required" });
  }
}
