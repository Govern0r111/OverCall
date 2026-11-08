from __future__ import annotations

import os
from pathlib import Path

ENCODINGS = ("cl100k_base", "o200k_base")


def warm_encodings(cache_dir: Path) -> None:
    resolved_cache_dir = cache_dir.resolve()
    resolved_cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ["TIKTOKEN_CACHE_DIR"] = str(resolved_cache_dir)

    import tiktoken

    for encoding_name in ENCODINGS:
        tiktoken.get_encoding(encoding_name)


def main() -> None:
    cache_dir = Path(os.environ.get("TIKTOKEN_CACHE_DIR", ".tiktoken"))
    warm_encodings(cache_dir)
    print(f"Warmed tiktoken encodings in {os.environ['TIKTOKEN_CACHE_DIR']}")


if __name__ == "__main__":
    main()
