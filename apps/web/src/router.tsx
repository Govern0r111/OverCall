import "./App.css";
import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Toaster } from "./components/ui/sonner";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LandingPage } from "./features/landing/LandingPage";
import AuthCallback from "./pages/AuthCallback";

const Overview = lazy(() => import("./pages/Overview"));
const Issues = lazy(() => import("./pages/Issues"));
const Providers = lazy(() => import("./pages/Providers"));
const Settings = lazy(() => import("./pages/Settings"));
const Logs = lazy(() => import("./pages/Logs"));
const AuthPage = lazy(() => import("./pages/AuthPage"));

const Shell = () => {
  const { theme } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setMobileMenuOpen(true)} menuOpen={mobileMenuOpen} />
          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
            <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12">
              <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading your page…</p>}>
                <Routes>
                  <Route index element={<Overview />} />
                  <Route path="issues" element={<Issues />} />
                  <Route path="logs" element={<Logs />} />
                  <Route path="providers" element={<Providers />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/app" replace />} />
                </Routes>
              </Suspense>
            </div>
          </main>
        </div>
      </div>
      <Toaster theme={theme} position="bottom-right" />
    </>
  );
};

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Suspense fallback={null}><AuthPage mode="login" /></Suspense>} />
        <Route path="/signup" element={<Suspense fallback={null}><AuthPage mode="signup" /></Suspense>} />
        <Route path="/forgot" element={<Suspense fallback={null}><AuthPage mode="forgot" /></Suspense>} />
        <Route path="/reset" element={<Suspense fallback={null}><AuthPage mode="reset" /></Suspense>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/app/*" element={<ProtectedRoute><AppProvider><Shell /></AppProvider></ProtectedRoute>} />
        <Route path="/issues" element={<Navigate to="/app/issues" replace />} />
        <Route path="/logs" element={<Navigate to="/app/logs" replace />} />
        <Route path="/providers" element={<Navigate to="/app/providers" replace />} />
        <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
