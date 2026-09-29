import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/ui/sonner";
import Overview from "./pages/Overview";
import Issues from "./pages/Issues";
import Providers from "./pages/Providers";
import Settings from "./pages/Settings";

const Shell = () => {
  const { theme } = useApp();
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/issues" element={<Issues />} />
              <Route path="/providers" element={<Providers />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </main>
      </div>
      <Toaster theme={theme} position="bottom-right" />
    </BrowserRouter>
  );
};

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
