let startPromise: Promise<void> | null = null;

export async function startDemoApi(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support the local demo API service worker.");
  }
  if (!startPromise) {
    const { worker } = await import("./browser");
    startPromise = worker.start({
      onUnhandledFrame: ({ frame, defaults }) => {
        const data = frame.data;
        const request =
          frame.protocol === "http" &&
          typeof data === "object" &&
          data !== null &&
          "request" in data &&
          data.request instanceof Request
            ? data.request
            : null;
        if (request && new URL(request.url).pathname.startsWith("/api/")) defaults.error();
        else frame.passthrough();
      },
    }).then(() => undefined).catch((error: unknown) => {
      startPromise = null;
      throw error;
    });
  }
  await startPromise;
}

export async function stopDemoApi(): Promise<void> {
  if (!startPromise) return;
  const { worker } = await import("./browser");
  worker.stop();
  startPromise = null;
}
