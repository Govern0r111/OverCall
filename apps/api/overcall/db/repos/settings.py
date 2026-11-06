from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.dialects.postgresql import insert

from ..models import UserSettings
from .base import BaseRepository


class UserSettingsRepository(BaseRepository):
    """Read and update the settings row owned by the current user."""

    _WRITABLE_FIELDS = frozenset(
        {
            "currency",
            "usd_inr_rate",
            "rules_enabled",
            "tier3_enabled",
            "thresholds",
            "upstream_mode",
            "retention_days",
        }
    )

    async def get(self) -> UserSettings | None:
        return await self.session.get(UserSettings, self.user_id)

    async def get_or_create(self) -> UserSettings:
        # The unique user_id key makes this safe when two first reads race.
        statement = (
            insert(UserSettings)
            .values(user_id=self.user_id)
            .on_conflict_do_nothing(index_elements=[UserSettings.user_id])
        )
        await self.session.execute(statement)
        settings = await self.get()
        if settings is None:
            raise RuntimeError("Settings row was not available after insert")
        return settings

    async def update(self, values: Mapping[str, Any]) -> UserSettings:
        unknown = set(values) - self._WRITABLE_FIELDS
        if unknown:
            raise ValueError(f"Unsupported settings fields: {', '.join(sorted(unknown))}")

        settings = await self.get_or_create()
        for field, value in values.items():
            setattr(settings, field, value)
        if values:
            settings.updated_at = datetime.now(UTC)
            await self.flush()
        return settings
