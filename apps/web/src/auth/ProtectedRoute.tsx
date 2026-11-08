import { ReactNode, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { authClient, AuthUser } from "./authClient";
import { AppAuthProvider } from "./AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = useRef<{ id: string; isDemo: boolean } | null | undefined>(undefined);
  const latestSession = useRef<AuthUser | null>(null);
  const transitionId = useRef(0);
  const transitionPending = useRef(false);

  useEffect(() => {
    let active = true;
    const applySession = (session: AuthUser | null) => {
      latestSession.current = session;
      setError(null);
      const currentIdentity = identity.current;
      const sameIdentity =
        currentIdentity !== undefined &&
        currentIdentity?.id === session?.id &&
        currentIdentity?.isDemo === session?.isDemo;

      if (sameIdentity) {
        if (!transitionPending.current) {
          setUser(session);
          setReady(true);
        }
        return;
      }

      transitionPending.current = true;
      setReady(false);
      const currentTransition = ++transitionId.current;
      void queryClient.cancelQueries().then(() => {
        if (currentTransition !== transitionId.current) return;
        queryClient.clear();
        transitionPending.current = false;
        identity.current = latestSession.current
          ? { id: latestSession.current.id, isDemo: latestSession.current.isDemo }
          : null;
        if (!active) return;
        setUser(latestSession.current);
        setReady(true);
      }).catch((reason: unknown) => {
        if (!active || currentTransition !== transitionId.current) return;
        transitionPending.current = false;
        setError(reason instanceof Error ? reason.message : "Unable to isolate workspace data.");
        setReady(true);
      });
    };
    void authClient.me().then(applySession).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Unable to check your session.");
      setReady(true);
    });
    const unsubscribe = authClient.onAuthStateChange(applySession);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient]);

  if (!ready) return <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">Loading your workspace…</div>;
  if (error) return <div className="grid min-h-screen place-items-center bg-background p-6 text-center text-sm text-destructive" role="alert">{error}</div>;
  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <AppAuthProvider user={user}>{children}</AppAuthProvider>;
}
