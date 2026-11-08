import { createContext, ReactNode, useContext, useMemo } from "react";
import type { AuthUser } from "./authClient";

interface AppAuth {
  user: AuthUser;
  isDemo: boolean;
}

const AuthContext = createContext<AppAuth | null>(null);

export function AppAuthProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  const value = useMemo(() => ({ user, isDemo: user.isDemo }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAppAuth(): AppAuth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAppAuth must be used within a protected app route.");
  return auth;
}
