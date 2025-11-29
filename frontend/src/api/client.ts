// In Docker: use /api proxy, in dev: use localhost:3000
const API_BASE = import.meta.env.PROD ? "/api" : "http://localhost:3000";

interface ApiError {
  error: string;
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    ...options?.headers as Record<string, string>,
  };
  
  // Only set Content-Type for requests with body
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    const data = (await res.json()) as ApiError;
    throw new Error(data.error || "Request failed");
  }

  return res.json() as Promise<T>;
}

export interface User {
  id: string;
  username: string;
  role: "admin" | "survivor" | "nikita";
}

export interface Round {
  id: string;
  startAt: string;
  endAt: string;
  totalScore: number;
  status: "cooldown" | "active" | "finished";
}

export interface RoundDetails extends Round {
  myTaps: number;
  myScore: number;
  winner: { username: string; score: number } | null;
}

export interface TapResult {
  taps: number;
  score: number;
}

export const api = {
  login: (username: string, password: string) =>
    request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request<{ success: boolean }>("/auth/logout", { method: "POST" }),

  me: () => request<User>("/auth/me"),

  getRounds: () => request<Round[]>("/rounds"),

  createRound: () => request<Round>("/rounds", { method: "POST" }),

  getRound: (id: string) => request<RoundDetails>(`/rounds/${id}`),

  tap: (roundId: string) =>
    request<TapResult>(`/rounds/${roundId}/tap`, { method: "POST" }),
};
