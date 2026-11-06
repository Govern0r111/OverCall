# Legacy Reference Scan Import Matching

Match legacy package import statements precisely so a modern identifier containing a legacy term is not misclassified.

## What Happened

In OverCall task t4, the legacy scanner's substring search treated `from .auth.jwt import SupabaseJWTVerifier` as a Supabase SDK import. The SQLModel API no longer needs `from_mongo`/`to_mongo` aliases, so those unused compatibility names were removed; import matching was narrowed to actual `import supabase` and `from supabase...` statements. Requirement manifests also need package-name checks for `supabase`/`supabase-py`, which are covered alongside false-positive cases.

## Takeaway

Anchor package-import checks to import statements and the imported module name; check dependency names separately when scanning requirements manifests. Add negative test cases for modern class or symbol names that contain the retired package name, as well as positive cases for both `import` and `from ... import` forms.

## History

- 2026-11-06 (OverCall/t4): initial
