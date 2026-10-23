import type { User } from "@supabase/supabase-js";
import { env } from "../lib/env";
import { supabase } from "./supabaseClient";

const usesSupabaseAuth = env.authMode === "supabase";

function getSupabaseClient() {
  if (!usesSupabaseAuth) return null;
  if (!supabase) throw new Error("VITE_AUTH_MODE=supabase requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
}

export interface AuthUser {
  id: string;
  email: string;
  isDemo: boolean;
}

export interface AuthClient {
  signup(email: string, password: string): Promise<{ user: AuthUser; needsEmailConfirmation: boolean }>;
  login(email: string, password: string): Promise<AuthUser>;
  loginWithGoogle(): Promise<void>;
  logout(): Promise<void>;
  me(): Promise<AuthUser | null>;
  getAccessToken(): Promise<string | null>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  continueAsDemo(): Promise<AuthUser>;
  isGoogleSignInAvailable(): boolean;
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void;
}

const SESSION_KEY = "overcall-mock-session";
let sessionEmailFallback: string | null = null;

function readDemoSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY) ?? sessionEmailFallback;
  } catch {
    return sessionEmailFallback;
  }
}

function writeDemoSession(email: string) {
  sessionEmailFallback = email;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email }));
  } catch {
    // Keep the demo session in memory when browser storage is unavailable.
  }
  window.dispatchEvent(new Event("overcall-auth-change"));
}

function clearDemoSession() {
  sessionEmailFallback = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // The in-memory session is still cleared.
  }
  window.dispatchEvent(new Event("overcall-auth-change"));
}

function toAuthUser(user: User, isDemo = false): AuthUser {
  return { id: user.id, email: user.email ?? "", isDemo };
}

function getDemoUser(): AuthUser | null {
  const stored = readDemoSession();
  if (!stored) return null;

  let session: unknown;
  try {
    session = JSON.parse(stored);
  } catch {
    clearDemoSession();
    return null;
  }
  if (
    !session ||
    typeof session !== "object" ||
    !("email" in session) ||
    typeof session.email !== "string"
  ) {
    clearDemoSession();
    return null;
  }

  return { id: "demo-user", email: session.email, isDemo: true };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const authClient: AuthClient = {
  async signup(email, password) {
    if (!usesSupabaseAuth && normalizeEmail(email) === "taken@example.com") {
      throw new Error("User already registered.");
    }
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.auth.signUp({ email: normalizeEmail(email), password });
      if (error || !data.user) throw error ?? new Error("Unable to create your account.");
      clearDemoSession();
      return { user: toAuthUser(data.user), needsEmailConfirmation: !data.session };
    }
    const user = { id: "demo-user", email: normalizeEmail(email), isDemo: true };
    writeDemoSession(user.email);
    return { user, needsEmailConfirmation: false };
  },
  async login(email, password) {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password });
      if (error || !data.user) throw error ?? new Error("Unable to sign in.");
      clearDemoSession();
      return toAuthUser(data.user);
    }
    if (!password) throw new Error("Enter your password.");
    const user = { id: "demo-user", email: normalizeEmail(email), isDemo: true };
    if (user.email === "wrong@example.com") throw new Error("Invalid login credentials.");
    writeDemoSession(user.email);
    return user;
  },
  async loginWithGoogle() {
    const client = getSupabaseClient();
    if (!client) throw new Error("Google sign-in is not available in demo mode.");
    clearDemoSession();
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  },
  async logout() {
    const isDemo = Boolean(getDemoUser());
    if (isDemo) {
      const { stopDemoApi } = await import("../mocks/startDemoApi");
      await stopDemoApi();
    }
    const client = isDemo ? null : getSupabaseClient();
    if (client) {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    }
    clearDemoSession();
  },
  async me() {
    const demoUser = getDemoUser();
    if (demoUser) return demoUser;
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.auth.getUser();
      if (error && error.name !== "AuthSessionMissingError") throw error;
      return data.user ? toAuthUser(data.user) : null;
    }
    return null;
  },
  async getAccessToken() {
    if (getDemoUser()) return null;
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    }
    return null;
  },
  async requestPasswordReset(email) {
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/reset`,
    });
    if (error) throw error;
  },
  async updatePassword(password) {
    const client = getSupabaseClient();
    if (!client) throw new Error("Password reset is only available for registered accounts.");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  },
  async continueAsDemo() {
    const user = { id: "demo-user", email: "demo@overcall.local", isDemo: true };
    writeDemoSession(user.email);
    return user;
  },
  isGoogleSignInAvailable() {
    return usesSupabaseAuth && Boolean(supabase);
  },
  onAuthStateChange(callback) {
    const onStorage = () => void authClient.me().then(callback);
    const onLocalChange = () => void authClient.me().then(callback);
    window.addEventListener("storage", onStorage);
    window.addEventListener("overcall-auth-change", onLocalChange);
    const { data } = (usesSupabaseAuth ? supabase : null)?.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ? toAuthUser(session.user) : null);
    }) ?? { data: null };

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("overcall-auth-change", onLocalChange);
      data?.subscription.unsubscribe();
    };
  },
};

export function hasDemoSession(): boolean {
  return readDemoSession() !== null;
}
