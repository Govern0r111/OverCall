# Versioned API And Proxy Paths

Keep the browser API, development proxy, and demo MSW handlers aligned to the FastAPI route prefixes instead of preserving legacy `/api` aliases.

## What Happened

In OverCall task t2.2, the backend exposed `/v1/*` and `/proxy/*` while browser requests and Vite used `/api/*`. The browser API base, proxy URL bases, affected endpoint suffixes, Vite proxy rules, and demo handlers were updated together. E2E with the backend stopped verified local demo handling, and a live local Vite-to-FastAPI probe confirmed the unchanged paths reached protected routes. The checks also showed that URL agreement does not resolve response DTO mismatches.

## Takeaway

When aligning a frontend API boundary, update the API client, Vite proxy, mock handlers, and URL tests as one unit. Verify the real proxy forwards the declared prefixes, but do not claim integration until response DTOs and authentication are also compatible.

## Example

```ts
const API_BASE_PATH = "/v1";
const openaiProxyBase = `${backendBase}/proxy/openai/v1`;
```

## History

- 2026-11-06 (`OverCall/t2.2`): initial
