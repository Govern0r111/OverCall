import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Chrome, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { authClient } from "../auth/authClient";
import { safeRedirect } from "../auth/safeRedirect";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Input } from "../components/ui/input";

type Mode = "login" | "signup" | "forgot" | "reset";

const createSchema = (mode: Mode) => z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string(),
  confirm: z.string(),
}).superRefine((values, context) => {
  if (mode === "login" && values.password.length < 8) {
    context.addIssue({ code: "custom", path: ["password"], message: "Use at least 8 characters." });
  }
  if ((mode === "signup" || mode === "reset") && values.password.length < 8) {
    context.addIssue({ code: "custom", path: ["password"], message: "Use at least 8 characters." });
  }
  if ((mode === "signup" || mode === "reset") && values.password !== values.confirm) {
    context.addIssue({ code: "custom", path: ["confirm"], message: "Passwords do not match." });
  }
});

type AuthFormValues = z.infer<ReturnType<typeof createSchema>>;

const friendlyError = (error: unknown) => {
  if (!(error instanceof Error)) return "Something went wrong. Please try again.";
  if (/invalid login credentials/i.test(error.message)) return "That email and password do not match. Check them and try again, or reset your password.";
  if (/already registered|user already exists/i.test(error.message)) return "An account already exists for this email. Try signing in instead.";
  if (/email not confirmed/i.test(error.message)) return "Confirm your email before signing in. Check your inbox for the confirmation link.";
  if (/rate limit|too many requests/i.test(error.message)) return "Too many attempts. Wait a moment before trying again.";
  if (/fetch|network/i.test(error.message)) return "We could not reach the sign-in service. Check your connection and try again.";
  return error.message;
};

export default function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => {
    try {
      const ended = sessionStorage.getItem("overcall-session-ended");
      sessionStorage.removeItem("overcall-session-ended");
      return ended ? "Your session ended. Sign in again to continue." : "";
    } catch {
      return "";
    }
  });
  const [formError, setFormError] = useState(false);
  const googleSignInAvailable = authClient.isGoogleSignInAvailable();
  const demoModeAvailable = authClient.isDemoModeAvailable();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AuthFormValues>({
    resolver: zodResolver(createSchema(mode)),
    defaultValues: { email: "", password: "", confirm: "" },
  });
  const next = safeRedirect(searchParams.get("next"));
  const title = mode === "login" ? "Welcome back" :
    mode === "signup" ? "Create your workspace" :
    mode === "forgot" ? "Reset your password" : "Choose a new password";

  const submit = async (values: AuthFormValues) => {
    setError("");
    setNotice("");
    setFormError(false);
    try {
      if (mode === "forgot") {
        await authClient.requestPasswordReset(values.email ?? "");
        setNotice("If an account exists, we’ll send a reset link shortly.");
        return;
      }
      if (mode === "reset") {
        await authClient.updatePassword(values.password ?? "");
        setNotice("Your password has been updated. You can now sign in.");
        return;
      }
      if (mode === "login") {
        const user = await authClient.login(values.email ?? "", values.password ?? "");
        if (user.isDemo) await (await import("../mocks/startDemoApi")).startDemoApi();
        navigate(next, { replace: true });
        return;
      }
      const result = await authClient.signup(values.email ?? "", values.password ?? "");
      if (result.needsEmailConfirmation) {
        setNotice("Check your email for a confirmation link before signing in.");
        return;
      }
      if (result.user.isDemo) await (await import("../mocks/startDemoApi")).startDemoApi();
      navigate(next, { replace: true });
    } catch (reason) {
      setError(friendlyError(reason));
      setFormError(true);
    }
  };

  const signInWithGoogle = async () => {
    setError("");
    setFormError(false);
    try {
      await authClient.loginWithGoogle();
    } catch (reason) {
      setError(friendlyError(reason));
      setFormError(true);
    }
  };

  const continueAsDemo = async () => {
    setError("");
    try {
      await authClient.continueAsDemo();
      await (await import("../mocks/startDemoApi")).startDemoApi();
      navigate(next, { replace: true });
    } catch (reason) {
      setError(friendlyError(reason));
      setFormError(true);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 sm:py-8">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Overcall
          </Link>
          <Link to="/" className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </header>

        <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <section aria-labelledby="auth-title" className="w-full max-w-md">
            <Card className="border-border bg-card shadow-none">
              <CardHeader className="space-y-3 p-6 pb-5 sm:p-8 sm:pb-6">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Overcall workspace</p>
                <h1 id="auth-title" className="text-3xl font-semibold tracking-tight">{title}</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  {mode === "login" ? demoModeAvailable ? "Sign in or try Overcall with a local demo session." : "Sign in to your Overcall workspace." :
                    mode === "signup" ? "Start with Google or create an account." :
                    mode === "forgot" ? "We’ll help you get back into your workspace." : "Set a new password for your account."}
                </p>
              </CardHeader>
              <CardContent className="space-y-5 p-6 pt-0 sm:p-8 sm:pt-0">
                {(mode === "login" || mode === "signup") && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full"
                      onClick={signInWithGoogle}
                      aria-describedby={!googleSignInAvailable ? "google-signin-help" : undefined}
                    >
                      <Chrome className="h-4 w-4" aria-hidden="true" /> Continue with Google
                    </Button>
                    {!googleSignInAvailable && (
                      <p id="google-signin-help" className="text-center text-xs text-muted-foreground" role="status">
                        Google sign-in requires Supabase Auth configuration.
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      <span>or use email</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  </>
                )}
                <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
                  {mode !== "reset" && (
                    <label htmlFor="auth-email" className="block space-y-2 text-sm font-medium">
                      Email
                      <Input
                        {...register("email")}
                        id="auth-email"
                        type="email"
                        autoComplete="email"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "auth-email-error" : undefined}
                        placeholder="you@example.com"
                      />
                      {errors.email && <FieldError id="auth-email-error" text={errors.email.message ?? "Enter a valid email address."} />}
                    </label>
                  )}
                  {mode !== "forgot" && (
                    <label htmlFor="auth-password" className="block space-y-2 text-sm font-medium">
                      {mode === "reset" ? "New password" : "Password"}
                      <div className="relative">
                        <Input
                          {...register("password")}
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={mode === "login" ? "current-password" : "new-password"}
                          aria-invalid={Boolean(errors.password)}
                          aria-describedby={errors.password ? "auth-password-error" : undefined}
                          className="h-11 pe-12"
                          placeholder="At least 8 characters"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground"
                        >
                          {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                        </Button>
                      </div>
                      {errors.password && <FieldError id="auth-password-error" text={errors.password.message ?? "Check your password."} />}
                    </label>
                  )}
                  {(mode === "signup" || mode === "reset") && (
                    <label htmlFor="auth-confirm" className="block space-y-2 text-sm font-medium">
                      Confirm password
                      <Input
                        {...register("confirm")}
                        id="auth-confirm"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        aria-invalid={Boolean(errors.confirm)}
                        aria-describedby={errors.confirm ? "auth-confirm-error" : undefined}
                      />
                      {errors.confirm && <FieldError id="auth-confirm-error" text={errors.confirm.message ?? "Passwords do not match."} />}
                    </label>
                  )}
                  {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
                  {notice && <p className="rounded-md border border-border bg-card px-3 py-2 text-sm" role="status">{notice}</p>}
                  {!notice.includes("updated") && (
                    <Button type="submit" disabled={isSubmitting} className="h-11 w-full">
                      {isSubmitting ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Create workspace" : mode === "forgot" ? "Send reset link" : "Update password"}
                    </Button>
                  )}
                  {formError && <span className="sr-only" role="status">Form submission failed.</span>}
                </form>
                {mode === "login" && (
                  <div className="flex flex-wrap justify-between gap-3 text-sm">
                    <Link to="/forgot" className="text-primary hover:underline">Forgot password?</Link>
                    <Link to="/signup" className="text-primary hover:underline">Create an account</Link>
                  </div>
                )}
                {demoModeAvailable && (mode === "login" || mode === "signup") && (
                  <Button type="button" variant="outline" onClick={() => void continueAsDemo()} className="h-11 w-full">
                    Continue as demo
                  </Button>
                )}
                {(mode === "forgot" || mode === "reset") && (
                  <p className="text-sm text-muted-foreground">
                    Remembered it? <Link to="/login" className="text-primary hover:underline">Back to log in</Link>
                  </p>
                )}
              </CardContent>
            </Card>
            <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
              Provider keys stay in your app. Request and response bodies are not stored.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

function FieldError({ id, text }: { id: string; text: string }) {
  return <span id={id} className="mt-1 block text-xs text-destructive">{text}</span>;
}
