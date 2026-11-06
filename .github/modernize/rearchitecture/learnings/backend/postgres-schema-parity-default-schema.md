# PostgreSQL Schema Parity Defaults

Schema-parity checks for SQLModel must account for implicit `public` tables and PostgreSQL's native floating-point precision mapping.

## What Happened

In OverCall task t4, the PostgreSQL integration test omitted SQLModel tables whose `schema` is `None`, although those tables correctly resolve to PostgreSQL's default `public` schema. It also compared inspector precision metadata directly with `Float(24)`, although PostgreSQL reports that type as `REAL` without a matching precision field.

## Takeaway

Treat `schema is None` as `public` when comparing an application model to public-schema migrations. For PostgreSQL float parity, compare the native `REAL` versus `DOUBLE PRECISION` type semantics; do not compare the inspector's precision attribute to the SQLAlchemy declaration. Check `Float` before fixed-precision `Numeric`, since SQLAlchemy's `Float` is also a `Numeric` subclass.

## History

- 2026-11-06 (OverCall/t4): initial
