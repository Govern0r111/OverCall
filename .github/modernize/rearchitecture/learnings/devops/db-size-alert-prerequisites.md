# DB-Size Alert Prerequisites

The scheduled database-size alert depends on a backend size endpoint as well as deployment workflow and secret configuration.

## What Happened
In OverCall task t28, the deployment plan described a daily GitHub Actions check against `/internal/db-size`, but the repository had no keep-alive workflow and no API route or database-size handler. The endpoint must exist with an explicit authorization/response contract before a workflow can be configured or tested; hosted verification also requires deployment access and GitHub secrets.

In t28.2, after the backend added that contract, the workflow separated the frequent `/readyz` request from the daily bearer-authenticated DB-size alert. It validates the 500 MiB response limit and fails above 80%, grants no `GITHUB_TOKEN` permissions, and uses `API_URL` and `INTERNAL_TOKEN` only from Actions secrets. Local YAML and shell checks cannot establish scheduled execution, notification delivery, or deployed-service behavior.

## Takeaway
Before implementing an operational alert workflow, verify that its target endpoint and auth contract exist in the current API. Keep local configuration checks separate from claims that a hosted schedule, alert threshold, credentials, or delivery behavior has been verified.

Grant a scheduled workflow no repository permissions unless it needs them; keep tokens in secret-backed environment variables rather than script literals. Validate the response shape before applying thresholds. Leave operations unchecked until Actions secrets are configured and a live run is observed; email delivery depends on notification settings, and scheduled workflows may need an external backup pinger.

## History
- 2026-11-06 (OverCall/t28): initial
- 2026-11-06 (OverCall/t28.2): added workflow safeguards and local-versus-hosted verification boundary
