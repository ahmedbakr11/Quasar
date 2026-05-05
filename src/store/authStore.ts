import { create } from "zustand";
import { getCurrentUser, login, logout, type UserProfile } from "@/lib/tauriCommands";

type AuthState = {
  sessionToken: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setAuth: (token: string, user: UserProfile) => void;
  setUser: (user: UserProfile) => void;
  clearAuth: () => void;
};

const storageKey = "luna_session_token";

export const useAuthStore = create<AuthState>((set, get) => ({
  sessionToken: null,
  user: null,
  isLoading: true,
  hydrate: async () => {
    const token = localStorage.getItem(storageKey);
    if (!token) {
      set({ isLoading: false, sessionToken: null, user: null });
      return;
    }
    try {
      const user = await getCurrentUser(token);
      set({ sessionToken: token, user, isLoading: false });
    } catch {
      localStorage.removeItem(storageKey);
      set({ sessionToken: null, user: null, isLoading: false });
    }
  },
  signIn: async (email, password) => {
    const result = await login({ email, password });
    localStorage.setItem(storageKey, result.token);
    set({ sessionToken: result.token, user: result.user, isLoading: false });
  },
  signOut: async () => {
    const { sessionToken } = get();
    if (sessionToken) {
      try {
        await logout(sessionToken);
      } catch {
        // ignore logout errors on client-side cleanup
      }
    }
    localStorage.removeItem(storageKey);
    set({ sessionToken: null, user: null });
  },
  setAuth: (token, user) => {
    localStorage.setItem(storageKey, token);
    set({ sessionToken: token, user, isLoading: false });
  },
  setUser: (user) => set({ user }),
  clearAuth: () => {
    localStorage.removeItem(storageKey);
    set({ sessionToken: null, user: null });
  }
}));
