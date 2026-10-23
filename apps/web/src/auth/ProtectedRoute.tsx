import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authClient, AuthUser } from "./authClient";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      setError(null);
      void authClient.me().then((session) => {
        if (!active) return;
        setUser(session);
        setReady(true);
      }).catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Unable to check your session.");
        setReady(true);
      });
    };
    load();
    const unsubscribe = authClient.onAuthStateChange(setUser);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!ready) return <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">Loading your workspace…</div>;
  if (error) return <div className="grid min-h-screen place-items-center bg-background p-6 text-center text-sm text-destructive" role="alert">{error}</div>;
  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}
