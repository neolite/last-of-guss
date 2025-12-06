// API base URL - use env var in production, localhost in dev
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

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

export interface GameSession {
  id: string;
  name: string;
  status: "waiting" | "countdown" | "active" | "finished";
  maxPlayers: number;
  currentPlayers: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
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

  // Game sessions
  getSessions: () => request<GameSession[]>("/sessions"),

  createSession: (name?: string, maxPlayers?: number) =>
    request<GameSession>("/sessions", {
      method: "POST",
      body: JSON.stringify({ name, maxPlayers }),
    }),

  getSession: (id: string) => request<GameSession>(`/sessions/${id}`),

  joinSession: (id: string) =>
    request<GameSession>(`/sessions/${id}/join`, { method: "POST" }),

  leaveSession: (id: string) =>
    request<GameSession>(`/sessions/${id}/leave`, { method: "POST" }),
};
