# Shared contract

This directory contains data contracts shared by the web and API applications.
It must not contain application code or secrets. `errors.json` is the initial
error registry. Synthetic request logs and their separate ground-truth labels
are defined by `synthetic-log.schema.json` and
`synthetic-ground-truth.schema.json`. Regenerate the small fixture from
`apps/api` with:

```powershell
python -m overcall.synthetic --seed 42 --days 7 --size small --out ../../contract/fixtures/synthetic/small
```

`openapi.yaml` is JSON-compatible YAML. API response schemas use standard
OpenAPI `content` definitions and are the input for the generated web types:

```powershell
npm --prefix apps/web run gen:api
```

Ground-truth labels are for offline evaluation only and must never be stored
with request logs.
