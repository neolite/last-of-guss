import { create } from "zustand";
import { api, type User } from "../api/client";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const user = await api.login(username, password);
      set({ user, isLoading: false });
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const user = await api.me();
      set({ user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
