/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getAccessToken, getMe, login as apiLogin, logout as apiLogout } from "./api";
import type { LoginPayload, UserRead } from "./types";

export const DEMO_ACCOUNT_EMAIL = "demo@flashquest.app";
const DEMO_SESSION_STARTED_KEY = "flashquest-demo-auth-started-at";
const DEMO_SESSION_MS = 2 * 60 * 1000;

type AuthValue = {
  user: UserRead | null;
  loading: boolean;
  signIn: (payload: LoginPayload) => Promise<UserRead>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function clearDemoSessionState(userId?: number) {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(DEMO_SESSION_STARTED_KEY);
  if (userId != null) {
    window.localStorage.removeItem(`flashquest-welcome-seen:${userId}`);
  }

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith("flashquest-")) window.sessionStorage.removeItem(key);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await getMe());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (payload: LoginPayload): Promise<UserRead> => {
    const response = await apiLogin(payload);
    if (response.user.email.toLowerCase() === DEMO_ACCOUNT_EMAIL) {
      window.localStorage.setItem(DEMO_SESSION_STARTED_KEY, String(Date.now()));
    }
    setUser(response.user);
    return response.user;
  }, []);

  const signOut = useCallback(async () => {
    const signedOutUser = user;
    try {
      await apiLogout();
    } catch {
      // apiLogout clears the local token in its finally block; local sign-out still completes.
    } finally {
      if (signedOutUser?.email.toLowerCase() === DEMO_ACCOUNT_EMAIL) {
        clearDemoSessionState(signedOutUser.id);
      }
      setUser(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.email.toLowerCase() !== DEMO_ACCOUNT_EMAIL) return;

    const rawStartedAt = window.localStorage.getItem(DEMO_SESSION_STARTED_KEY);
    const parsedStartedAt = rawStartedAt ? Number(rawStartedAt) : Number.NaN;
    const startedAt = Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now();
    if (!Number.isFinite(parsedStartedAt)) {
      window.localStorage.setItem(DEMO_SESSION_STARTED_KEY, String(startedAt));
    }

    const remainingMs = Math.max(0, DEMO_SESSION_MS - (Date.now() - startedAt));
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await apiLogout();
        } catch {
          // The API helper still clears the browser token on failure.
        } finally {
          clearDemoSessionState(user.id);
          setUser(null);
          window.location.replace("/");
        }
      })();
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [user]);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refresh }),
    [user, loading, signIn, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
