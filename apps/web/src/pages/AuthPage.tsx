import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Chrome, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { authClient } from "../auth/authClient";
import { safeRedirect } from "../auth/safeRedirect";

type Mode = "login" | "signup" | "forgot" | "reset";
type AuthFormValues = { email?: string; password?: string; confirm?: string };

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
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" /> Overcall</Link>
        <div>
          <p className="max-w-md text-4xl font-semibold leading-tight">Make every API request earn its place.</p>
          <p className="mt-5 max-w-md text-sm leading-6 text-primary-foreground/70">A quiet, useful view of waste hiding in your provider bill.</p>
        </div>
        <p className="text-xs text-primary-foreground/60">Free during beta</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-12 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login" ? "Sign in or try Overcall with a local demo session." :
              mode === "signup" ? "Start with Google or create an account." :
              mode === "forgot" ? "We’ll help you get back into your workspace." : "Set a new password for your account."}
          </p>
          {(mode === "login" || mode === "signup") && authClient.isGoogleSignInAvailable() && (
            <>
              <button type="button" onClick={signInWithGoogle} className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-accent">
                <Chrome className="h-4 w-4" /> Continue with Google
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>or use email</span><span className="h-px flex-1 bg-border" /></div>
            </>
          )}
          <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
            {mode !== "reset" && (
              <label htmlFor="auth-email" className="block text-sm font-medium">
                Email
                <input
                  {...register("email")}
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "auth-email-error" : undefined}
                  className="mt-2 h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                  placeholder="you@example.com"
                />
                {errors.email && <FieldError id="auth-email-error" text={errors.email.message ?? "Enter a valid email address."} />}
              </label>
            )}
            {mode !== "forgot" && (
              <label htmlFor="auth-password" className="block text-sm font-medium">
                {mode === "reset" ? "New password" : "Password"}
                <div className="relative mt-2">
                  <input
                    {...register("password")}
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "auth-password-error" : undefined}
                    className="h-11 w-full rounded-md border border-input bg-card px-3 pr-10 text-sm"
                    placeholder="At least 8 characters"
                  />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <FieldError id="auth-password-error" text={errors.password.message ?? "Check your password."} />}
              </label>
            )}
            {(mode === "signup" || mode === "reset") && (
              <label htmlFor="auth-confirm" className="block text-sm font-medium">
                Confirm password
                <input
                  {...register("confirm")}
                  id="auth-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.confirm)}
                  aria-describedby={errors.confirm ? "auth-confirm-error" : undefined}
                  className="mt-2 h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                />
                {errors.confirm && <FieldError id="auth-confirm-error" text={errors.confirm.message ?? "Passwords do not match."} />}
              </label>
            )}
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
            {notice && <p className="rounded-md border border-border bg-card px-3 py-2 text-sm" role="status">{notice}</p>}
            {!notice.includes("updated") && (
              <button disabled={isSubmitting} className="h-11 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Create workspace" : mode === "forgot" ? "Send reset link" : "Update password"}
              </button>
            )}
            {formError && <span className="sr-only" role="status">Form submission failed.</span>}
          </form>
          {mode === "login" && <div className="mt-4 flex justify-between text-sm"><Link to="/forgot" className="text-primary hover:underline">Forgot password?</Link><Link to="/signup" className="text-primary hover:underline">Create an account</Link></div>}
          {(mode === "login" || mode === "signup") && (
            <button type="button" onClick={() => void continueAsDemo()} className="mt-6 h-11 w-full rounded-md border border-border text-sm font-medium hover:bg-accent">Continue as demo</button>
          )}
          {(mode === "forgot" || mode === "reset") && <p className="mt-5 text-sm text-muted-foreground">Remembered it? <Link to="/login" className="text-primary hover:underline">Back to log in</Link></p>}
        </div>
      </section>
    </main>
  );
}

function FieldError({ id, text }: { id: string; text: string }) {
  return <span id={id} className="mt-1 block text-xs text-destructive">{text}</span>;
}
