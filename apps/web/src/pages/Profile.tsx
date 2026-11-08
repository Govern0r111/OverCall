import { useState } from "react";
import { KeyRound, LogOut, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAppAuth } from "../auth/AuthContext";
import { authClient } from "../auth/authClient";
import { PageHeader, Card } from "../components/PageHeader";
import { Button } from "../components/ui/button";

export default function Profile() {
  const { user, isDemo } = useAppAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const signOut = async () => {
    setError("");
    try {
      await authClient.logout();
      navigate("/login", { replace: true });
    } catch {
      setError("Couldn't sign out. Please try again.");
    }
  };

  return (
    <div>
      <PageHeader title="Profile" description="Manage your account and sign-in options." />
      <Card className="max-w-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Account</h2>
            <p className="mt-1 text-sm text-muted-foreground">Signed in as</p>
            <p className="mt-1 break-all text-sm font-medium">
              {user.email.trim() || <span className="text-muted-foreground">Email address unavailable</span>}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">{isDemo ? "Demo account" : "Personal account"}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 border-t border-divider pt-5">
          <Button asChild variant="outline">
            <Link to="/forgot">
              <KeyRound aria-hidden="true" className="h-4 w-4" />
              Reset password
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Sign out
          </Button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </Card>
    </div>
  );
}
