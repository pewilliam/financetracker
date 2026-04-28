import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearToken, getMe, getToken, login, register, setToken, updateMe } from "../api/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    let mounted = true;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const payload = await getMe();
        if (mounted) setUser(payload);
      } catch {
        clearToken();
      } finally {
        if (mounted) setLoading(false);
      }
    }
    restore();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authenticated: Boolean(user),
      async signIn(credentials) {
        const payload = await login(credentials);
        setToken(payload.access_token);
        setUser(payload.user);
      },
      async signUp(data) {
        const payload = await register(data);
        setToken(payload.access_token);
        setUser(payload.user);
      },
      async updateProfile(data) {
        const payload = await updateMe(data);
        setUser(payload);
      },
      logout() {
        clearToken();
        setUser(null);
      }
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
