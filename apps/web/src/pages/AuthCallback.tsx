import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "../auth/authClient";
import { safeRedirect } from "../auth/safeRedirect";

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

  if (!error) return <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground" role="status">Completing sign-in…</main>;
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div>
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Link to="/login" className="mt-4 inline-block text-sm text-primary hover:underline">Return to sign in</Link>
      </div>
    </main>
  );
}
