import "./styles/tokens.css";
import "./styles/globals.css";
import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppRouter from "./router";
import { hasDemoSession } from "./auth/authClient";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        axios.isAxiosError(error) &&
        (!error.response || error.response.status >= 500) &&
        failureCount < 2,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("The application root element is missing.");

const root = ReactDOM.createRoot(rootElement);

const renderApp = () => root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  </React.StrictMode>,
);

async function startApp() {
  if (hasDemoSession()) {
    const { startDemoApi } = await import("./mocks/startDemoApi");
    await startDemoApi();
  }
  renderApp();
}

void startApp().catch((error: unknown) => {
  console.error("Overcall demo API failed to start.", error);
  root.render(
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <p role="alert" className="max-w-lg text-center text-sm">
        The local demo API could not start. Refresh the page or disable the browser's service-worker restrictions and try again.
      </p>
    </main>,
  );
});
