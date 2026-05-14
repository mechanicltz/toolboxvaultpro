import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError, getToken, setToken, setUnauthorizedHandler, bootstrapToken } from "./api";
import { loadCacheFromDisk, clearCached } from "./cache";
import { startNetworkWatcher } from "./network";
import { logoutRevenueCat } from "./revenuecat";

const USER_CACHE_KEY = "tt.auth.user";

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  created_at: string;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name?: string,
    promoCode?: string,
  ) => Promise<{ promoRedeemed?: boolean; promoError?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

async function readCachedUser(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

async function writeCachedUser(u: AuthUser | null) {
  try {
    if (u) await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    else await AsyncStorage.removeItem(USER_CACHE_KEY);
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
    writeCachedUser(u);
  }, []);

  const refresh = useCallback(async () => {
    const tok = await getToken();
    if (!tok) {
      setUserState(null);
      await writeCachedUser(null);
      return;
    }
    // Show cached user immediately so screens don't flash to login while
    // we revalidate in the background.
    const cached = await readCachedUser();
    if (cached) setUserState(cached);

    try {
      const me = await api.me();
      setUserState(me as AuthUser);
      await writeCachedUser(me as AuthUser);
    } catch (e) {
      // If the server explicitly says 401, the token is dead → log out.
      if (e instanceof ApiError && e.status === 401) {
        await setToken(null);
        setUserState(null);
        await writeCachedUser(null);
        return;
      }
      // Network / offline / 5xx — keep the cached session alive so the
      // app stays usable without internet.
      if (cached) {
        setUserState(cached);
      }
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUserState(null);
      writeCachedUser(null);
    });
    (async () => {
      // Eagerly populate the in-memory auth token BEFORE any screen
      // renders so that the very first API call after a navigation
      // already includes the Authorization header. Without this, screens
      // using `useFocusEffect(load)` could fire an unauthenticated
      // request and silently show their empty state.
      await bootstrapToken();
      // Hydrate the in-memory cache from disk BEFORE any screen renders so
      // every list shows previously-fetched data instantly.
      await loadCacheFromDisk();
      // Kick off the global online/offline watcher.
      startNetworkWatcher();
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    // Wipe any cached data BEFORE the new auth — prevents the new user from
    // briefly seeing the previous user's tools/locations/etc., and prevents
    // stale cached data from a different account showing up at all.
    await clearCached();
    const res = await api.login({ email, password });
    await setToken(res.token);
    setUserState(res.user as AuthUser);
    await writeCachedUser(res.user as AuthUser);
  }, []);

  const register = useCallback(async (
    email: string,
    password: string,
    name?: string,
    promoCode?: string,
  ): Promise<{ promoRedeemed?: boolean; promoError?: string }> => {
    await clearCached();
    const res = await api.register({ email, password, name });
    await setToken(res.token);
    setUserState(res.user as AuthUser);
    await writeCachedUser(res.user as AuthUser);

    // Best-effort: redeem the promo code right after signup. We don't fail
    // registration if the code is bad — we just surface the error so the UI
    // can show a non-blocking warning ("Account created, but code invalid").
    const code = (promoCode || "").trim();
    if (!code) return {};
    try {
      await api.redeemPromo(code);
      return { promoRedeemed: true };
    } catch (e: any) {
      return {
        promoRedeemed: false,
        promoError: e?.detail || e?.message || "Could not redeem promo code",
      };
    }
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setUserState(null);
    await writeCachedUser(null);
    // Wipe everything on logout so the next login starts clean.
    await clearCached();
    // Wipe stored biometric credentials so that signing back in as a
    // different user can't auto-unlock with the previous user's saved
    // password. The user can re-enable biometric on their next sign-in.
    try {
      const { disableBiometric } = await import("./biometric");
      await disableBiometric();
    } catch {
      /* ignore */
    }
    // Detach the user from RevenueCat so the next login doesn't inherit
    // the previous app-user's entitlement state. Best-effort — no-op in
    // stub / Expo Go.
    try {
      await logoutRevenueCat();
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
