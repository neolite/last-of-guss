import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import type { UserRole } from "../db/schema.js";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

export function getRoleFromUsername(username: string): UserRole {
  const lower = username.toLowerCase();
  if (lower === "admin") return "admin";
  if (lower === "никита" || lower === "nikita") return "nikita";
  return "survivor";
}
