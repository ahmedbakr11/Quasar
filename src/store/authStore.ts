import { create } from "zustand";
import { getCurrentUser, login, logout, type UserProfile } from "@/lib/tauriCommands";

type AuthState = {
  sessionToken: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  setAuth: (token: string, user: UserProfile) => void;
  setUser: (user: UserProfile) => void;
  clearAuth: () => void;
};

const storageKey = "luna_session_token";

const readStoredToken = () => localStorage.getItem(storageKey);
const writeStoredToken = (token: string, rememberMe: boolean) => {
  if (rememberMe) {
    localStorage.setItem(storageKey, token);
  } else {
    localStorage.removeItem(storageKey);
  }
};
const clearStoredToken = () => {
  localStorage.removeItem(storageKey);
};

export const useAuthStore = create<AuthState>((set, get) => ({
  sessionToken: null,
  user: null,
  isLoading: true,
  hydrate: async () => {
    const token = readStoredToken();
    if (!token) {
      set({ isLoading: false, sessionToken: null, user: null });
      return;
    }
    try {
      const user = await getCurrentUser(token);
      set({ sessionToken: token, user, isLoading: false });
    } catch {
      clearStoredToken();
      set({ sessionToken: null, user: null, isLoading: false });
    }
  },
  signIn: async (email, password, rememberMe = true) => {
    const result = await login({ email, password });
    writeStoredToken(result.token, rememberMe);
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
    clearStoredToken();
    set({ sessionToken: null, user: null });
  },
  setAuth: (token, user) => {
    writeStoredToken(token, true);
    set({ sessionToken: token, user, isLoading: false });
  },
  setUser: (user) => set({ user }),
  clearAuth: () => {
    clearStoredToken();
    set({ sessionToken: null, user: null });
  }
}));
