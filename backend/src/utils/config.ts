import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  roundDuration: parseInt(process.env.ROUND_DURATION || "60", 10),
  cooldownDuration: parseInt(process.env.COOLDOWN_DURATION || "30", 10),
  databaseUrl: process.env.DATABASE_URL!,
} as const;
