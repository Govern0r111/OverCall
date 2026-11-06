import pytest

from scripts.check_legacy_dependencies import _has_legacy_reference


@pytest.mark.parametrize(
    "line",
    [
        "import pymongo",
        "from motor.motor_asyncio import AsyncIOMotorClient",
        "import emergentintegrations",
        "import supabase",
        "import supabase.auth as auth",
        "from supabase import create_client",
        "from supabase.auth import AuthClient",
        "record.from_mongo(data)",
        "record.to_mongo()",
        "import costguard",
        "header = 'X-CostGuard-Key'",
    ],
)
def test_legacy_references_are_detected(line: str) -> None:
    assert _has_legacy_reference(line)


@pytest.mark.parametrize(
    "line",
    [
        "from .auth.jwt import SupabaseJWTVerifier",
        "from overcall.db.models import SQLModel",
        "from .synthetic.generator import SyntheticLog",
    ],
)
def test_modern_names_that_contain_legacy_terms_are_allowed(line: str) -> None:
    assert not _has_legacy_reference(line)


@pytest.mark.parametrize(
    "line",
    [
        "supabase==2.15.0",
        "supabase-py>=1.0.0",
        "pymongo==4.0.0",
        "motor[docs]>=3.0.0",
        "emergentintegrations~=0.1.0",
    ],
)
def test_legacy_dependencies_are_detected_in_manifests(line: str) -> None:
    assert _has_legacy_reference(line, dependency_manifest=True)


def test_unrelated_dependency_with_supabase_substring_is_allowed() -> None:
    assert not _has_legacy_reference("supabase-jwt-helper==1.0.0", dependency_manifest=True)
