import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from costguard.api import router as api_router  # noqa: E402
from costguard.db import client, ensure_indexes  # noqa: E402
from costguard.mock_llm import mock_app  # noqa: E402
from costguard.proxy import router as proxy_router  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="API Cost Guard")
app.include_router(api_router)
app.include_router(proxy_router)
app.mount("/api/mock/openai", mock_app)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-costguard-request-id"],
)


@app.on_event("startup")
async def startup():
    await ensure_indexes()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
