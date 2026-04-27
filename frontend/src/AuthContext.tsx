import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";

export type Subscription = {
  tier: "free" | "monthly" | "yearly" | "lifetime";
  status: "active" | "cancelled" | "expired";
  started_at?: string | null;
  expires_at?: string | null;
  cancelled_at?: string | null;
  auto_renew: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  subscription: Subscription;
  created_at: string;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  isPremium: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const isPremiumTier = (tier?: string) =>
  tier === "monthly" || tier === "yearly" || tier === "lifetime";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const tok = await getToken();
      if (!tok) {
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser(me as AuthUser);
    } catch {
      // Token invalid → clear
      await setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email: email.trim().toLowerCase(), password });
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await api.register({ email: email.trim().toLowerCase(), password, name });
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
    // Clear any cached data so next user doesn't see previous user's items
    try {
      const { clearCached } = await import("./cache");
      clearCached();
    } catch {}
  }, []);

  const isPremium = isPremiumTier(user?.subscription?.tier);

  return (
    <AuthContext.Provider value={{ user, loading, isPremium, login, register, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
