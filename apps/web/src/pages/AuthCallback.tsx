import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { authClient } from "../auth/authClient";
import { safeRedirect } from "../auth/safeRedirect";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void authClient.me().then((user) => {
      if (!active) return;
      if (user) navigate(safeRedirect(searchParams.get("next")), { replace: true });
      else setError("The sign-in link is invalid or has expired. Request a new one and try again.");
    }).catch(() => {
      if (active) setError("We could not complete sign-in. Please try again.");
    });
    return () => { active = false; };
  }, [navigate, searchParams]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 sm:py-8">
        <Link to="/" className="inline-flex items-center gap-2 self-start font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          Overcall
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <Card className="w-full max-w-md border-border bg-card shadow-none">
            <CardContent className="p-6 sm:p-8">
              {error ? (
                <section aria-labelledby="callback-title" className="space-y-4">
                  <h1 id="callback-title" className="text-2xl font-semibold tracking-tight">Unable to complete sign-in</h1>
                  <p role="alert" className="text-sm leading-6 text-destructive">{error}</p>
                  <Button asChild className="h-11 w-full">
                    <Link to="/login">Return to sign in</Link>
                  </Button>
                </section>
              ) : (
                <section role="status" aria-labelledby="callback-title" className="space-y-4 text-center">
                  <LoaderCircle aria-hidden="true" className="mx-auto h-6 w-6 text-primary motion-safe:animate-spin motion-reduce:hidden" />
                  <h1 id="callback-title" className="text-2xl font-semibold tracking-tight">Completing sign-in</h1>
                  <p className="text-sm leading-6 text-muted-foreground">One moment while we verify your sign-in link.</p>
                </section>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
