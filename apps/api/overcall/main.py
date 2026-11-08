from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.responses import JSONResponse, Response

from .auth.jwt import SupabaseJWTVerifier
from .config import Settings, get_settings
from .db.engine import create_database_engine
from .errors import ERROR_CATALOG, OvercallError, register_error_handlers, unhandled_error_handler
from .internal_api import router as internal_router
from .logging import configure_logging, get_logger, get_request_id, reset_request_id, set_request_id
from .proxy import router as proxy_router
from .rate_limits import InMemoryRateLimiter
from .request_limits import RequestBodyLimitMiddleware
from .v1_api import router as v1_router

logger = get_logger(__name__)


class VersionedCorsMiddleware:
    def __init__(self, app, settings: Settings) -> None:
        self.app = app
        self.cors_app = CORSMiddleware(
            app,
            allow_origins=settings.cors_origin_list,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Overcall-Request-Id"],
        )

    async def __call__(self, scope, receive, send) -> None:
        path = scope.get("path", "")
        if scope["type"] == "http" and (path == "/v1" or path.startswith("/v1/")):
            await self.cors_app(scope, receive, send)
        else:
            await self.app(scope, receive, send)


class ProxyConcurrencyMiddleware:
    def __init__(self, app, *, max_inflight: int) -> None:
        self.app = app
        self.max_inflight = max_inflight
        self.inflight = 0

    async def __call__(self, scope, receive, send) -> None:
        path = scope.get("path", "")
        if scope["type"] == "http" and (path == "/proxy" or path.startswith("/proxy/")):
            if self.inflight >= self.max_inflight:
                definition = ERROR_CATALOG["overloaded"]
                response = JSONResponse(
                    content={
                        "error": {
                            "code": "overloaded",
                            "message": definition["message"],
                            "request_id": get_request_id(),
                        }
                    },
                    status_code=definition["status"],
                    headers={"Retry-After": "1"},
                )
                await response(scope, receive, send)
                return
            self.inflight += 1
            try:
                await self.app(scope, receive, send)
            finally:
                self.inflight -= 1
            return
        await self.app(scope, receive, send)


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    os.environ["TIKTOKEN_CACHE_DIR"] = app_settings.tiktoken_cache_dir

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        configure_logging(app_settings.log_level)
        app.state.engine = create_database_engine(app_settings)
        try:
            yield
        finally:
            if app.state.engine is not None:
                await app.state.engine.dispose()

    app = FastAPI(
        title="Overcall API",
        version=app_settings.release,
        lifespan=lifespan,
    )
    app.state.settings = app_settings
    app.state.engine = None
    app.state.rate_limiter = InMemoryRateLimiter()
    app.state.jwt_verifier = SupabaseJWTVerifier(
        supabase_url=app_settings.supabase_url,
        jwt_secret=(
            app_settings.supabase_jwt_secret.get_secret_value()
            if app_settings.supabase_jwt_secret is not None
            else None
        ),
        allowed_algorithms=app_settings.jwt_allowed_algorithms,
    )
    register_error_handlers(app)
    app.include_router(internal_router)
    app.include_router(v1_router)
    app.include_router(proxy_router)
    app.add_middleware(VersionedCorsMiddleware, settings=app_settings)
    app.add_middleware(
        RequestBodyLimitMiddleware,
        max_body_bytes=app_settings.max_request_body_bytes,
    )
    app.add_middleware(
        ProxyConcurrencyMiddleware,
        max_inflight=app_settings.max_inflight,
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next) -> Response:
        request_id = f"req_{uuid4().hex}"
        token = set_request_id(request_id)
        started = time.perf_counter()
        try:
            try:
                response = await call_next(request)
            except Exception as exc:
                response = await unhandled_error_handler(request, exc)
            response.headers["X-Overcall-Request-Id"] = request_id
            route = request.scope.get("route")
            route_path = getattr(route, "path", "unmatched")
            logger.info(
                "request_complete method=%s route=%s status=%s duration_ms=%.2f",
                request.method,
                route_path,
                response.status_code,
                (time.perf_counter() - started) * 1000,
            )
            return response
        finally:
            reset_request_id(token)

    @app.get("/healthz", include_in_schema=True)
    async def health() -> dict[str, str]:
        return {"status": "ok", "release": app_settings.release}

    @app.get("/readyz", include_in_schema=True)
    async def readiness(request: Request) -> dict[str, str]:
        engine = request.app.state.engine
        if engine is None:
            raise OvercallError("not_ready", 503, "The service is not ready. Try again shortly.")
        try:
            async with engine.connect() as connection:
                await connection.execute(text("select 1"))
        except Exception as exc:
            logger.warning("Database readiness check failed: %s", type(exc).__name__)
            raise OvercallError(
                "not_ready", 503, "The service is not ready. Try again shortly."
            ) from exc
        return {"status": "ok"}

    return app


app = create_app()
