from __future__ import annotations

import re
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = (
    API_ROOT / "overcall",
    API_ROOT / "requirements.txt",
    API_ROOT / "requirements-dev.txt",
)
FORBIDDEN = (
    re.compile(r"(?i)\b(?:pymongo|motor|emergentintegrations)\b"),
    re.compile(
        r"(?im)^\s*(?:"
        r"from\s+supabase(?:\.[\w.]+)?\s+import\b|"
        r"import\s+supabase(?:\.[\w.]+)?(?:\s*(?:,|as\b|$))"
        r")"
    ),
    re.compile(r"(?i)\b(?:from_mongo|to_mongo|costguard|x-costguard)\b"),
)
FORBIDDEN_DEPENDENCY = re.compile(
    r"(?i)^\s*(?:supabase(?:-py)?|pymongo|motor|emergentintegrations)"
    r"(?:\[[^\]]+\])?\s*(?:[=<>!~;@]|$)"
)


def _has_legacy_reference(line: str, *, dependency_manifest: bool = False) -> bool:
    return any(pattern.search(line) for pattern in FORBIDDEN) or (
        dependency_manifest and FORBIDDEN_DEPENDENCY.search(line) is not None
    )


def main() -> int:
    violations = []
    for root in SCAN_ROOTS:
        files = root.rglob("*.py") if root.is_dir() else (root,)
        for file_path in files:
            for line_number, line in enumerate(
                file_path.read_text(encoding="utf-8").splitlines(), 1
            ):
                if _has_legacy_reference(
                    line, dependency_manifest=file_path.name.startswith("requirements")
                ):
                    violations.append(f"{file_path.relative_to(API_ROOT)}:{line_number}")
    if violations:
        print("Legacy backend references remain:")
        print("\n".join(violations))
        return 1
    print("Legacy Mongo and Supabase SDK references are absent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
