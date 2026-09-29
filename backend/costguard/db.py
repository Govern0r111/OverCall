import os
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"], tz_aware=True)
db = client[os.environ["DB_NAME"]]

logs_col = db.request_logs
issues_col = db.issues
settings_col = db.settings
runs_col = db.detection_runs

LOG_TTL_SECONDS = 30 * 86400


async def ensure_indexes():
    await logs_col.create_index("timestamp", expireAfterSeconds=LOG_TTL_SECONDS, name="ttl_timestamp")
    await logs_col.create_index([("provider", 1), ("timestamp", 1)])
    await logs_col.create_index("source")
    await issues_col.create_index([("provider", 1), ("severity", 1)])
