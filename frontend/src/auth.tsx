import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getAccessToken, getMe, login as apiLogin, logout as apiLogout } from "./api";
import type { LoginPayload, UserRead } from "./types";

type AuthValue = {
  user: UserRead | null;
  loading: boolean;
  signIn: (payload: LoginPayload) => Promise<UserRead>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
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
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function signIn(payload: LoginPayload): Promise<UserRead> {
    const response = await apiLogin(payload);
    setUser(response.user);
    return response.user;
  }

  async function signOut() {
    await apiLogout();
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refresh }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
