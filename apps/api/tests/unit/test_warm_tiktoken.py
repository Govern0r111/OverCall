import os
import sys
from pathlib import Path
from types import SimpleNamespace

from scripts.warm_tiktoken import warm_encodings


def test_warm_encodings_uses_configured_cache_and_loads_required_encodings(
    monkeypatch, tmp_path: Path
) -> None:
    requested: list[str] = []
    monkeypatch.setitem(
        sys.modules,
        "tiktoken",
        SimpleNamespace(get_encoding=requested.append),
    )
    cache_dir = tmp_path / "tiktoken-cache"

    warm_encodings(cache_dir)

    assert cache_dir.is_dir()
    assert Path(os.environ["TIKTOKEN_CACHE_DIR"]) == cache_dir.resolve()
    assert requested == ["cl100k_base", "o200k_base"]
