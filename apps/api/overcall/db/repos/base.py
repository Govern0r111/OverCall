from __future__ import annotations

from typing import TypeVar
from uuid import UUID

from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, select

Entity = TypeVar("Entity", bound=SQLModel)


class BaseRepository:
    def __init__(self, session: AsyncSession, user_id: UUID) -> None:
        self.session = session
        self.user_id = user_id

    def select_for_user(self, model: type[Entity]) -> Select[tuple[Entity]]:
        """Start a query already scoped to this repository's tenant."""
        return select(model).where(model.user_id == self.user_id)

    def add_for_user(self, entity: Entity) -> Entity:
        """Attach an entity to this tenant, ignoring any caller-supplied user id."""
        if not hasattr(entity, "user_id"):
            raise TypeError("Tenant-owned entities must define user_id")
        entity.user_id = self.user_id
        self.session.add(entity)
        return entity

    async def flush(self) -> None:
        """Flush pending writes without committing the caller's transaction."""
        await self.session.flush()
