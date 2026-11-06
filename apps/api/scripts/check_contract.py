from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API_ROOT = ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from overcall.config import Settings  # noqa: E402
from overcall.main import create_app  # noqa: E402


def _response_schema(operation: dict, status: str) -> dict:
    response = operation["responses"][status]
    return response.get("content", {}).get("application/json", {}).get("schema", {})


def _type_name(schema: dict) -> str:
    if "$ref" in schema:
        return "ref:" + schema["$ref"].rsplit("/", 1)[-1]
    if "anyOf" in schema:
        non_null = [item for item in schema["anyOf"] if item.get("type") != "null"]
        return "nullable:" + "|".join(_type_name(item) for item in non_null)
    if schema.get("type") == "array":
        return "array:" + _type_name(schema.get("items", {}))
    result = schema.get("type", "?")
    if schema.get("format"):
        result += ":" + schema["format"]
    return result


def main() -> int:
    contract_path = ROOT / "contract" / "openapi.yaml"
    # JSON is a YAML 1.2 subset; this avoids adding a runtime YAML parser dependency.
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    generated = create_app(Settings(app_env="test", database_url=None)).openapi()
    generated_paths = {
        path: operations
        for path, operations in generated["paths"].items()
        if path.startswith("/v1/")
    }
    failures: list[str] = []
    if set(generated_paths) != set(contract["paths"]):
        missing = sorted(set(generated_paths) - set(contract["paths"]))
        stale = sorted(set(contract["paths"]) - set(generated_paths))
        failures.append(f"path drift: undocumented={missing}, stale={stale}")

    for path, contract_operations in contract["paths"].items():
        generated_operations = generated_paths.get(path, {})
        expected_methods = {method for method in contract_operations if not method.startswith("x-")}
        actual_methods = {
            method
            for method in generated_operations
            if method in {"get", "post", "put", "patch", "delete", "options", "head"}
        }
        if expected_methods != actual_methods:
            failures.append(
                f"method drift for {path}: contract={sorted(expected_methods)}, "
                f"generated={sorted(actual_methods)}"
            )
        for method, expected in contract_operations.items():
            if method.startswith("x-"):
                continue
            actual = generated_operations.get(method)
            if actual is None:
                failures.append(f"missing operation: {method.upper()} {path}")
                continue
            expected_success = {
                status for status in expected["responses"] if status.startswith("2")
            }
            actual_success = {status for status in actual["responses"] if status.startswith("2")}
            if expected_success != actual_success:
                failures.append(
                    f"status drift for {method.upper()} {path}: "
                    f"contract={sorted(expected_success)}, generated={sorted(actual_success)}"
                )
            model_name = expected.get("x-response-model")
            if model_name is None:
                continue
            status = sorted(expected_success)[0]
            schema = _response_schema(actual, status)
            if expected.get("x-response-container") == "array":
                schema = schema.get("items", {})
            reference = schema.get("$ref", "").rsplit("/", 1)[-1]
            actual_model = generated["components"]["schemas"].get(reference, {})
            actual_properties = set(actual_model.get("properties", {}))
            expected_properties = set(expected.get("x-response-properties", []))
            if reference != model_name or actual_properties != expected_properties:
                failures.append(
                    f"response shape drift for {method.upper()} {path}: "
                    f"model={reference or 'inline'}, expected={model_name}, "
                    f"missing={sorted(expected_properties - actual_properties)}, "
                    f"extra={sorted(actual_properties - expected_properties)}"
                )
                continue
            actual_required = set(actual_model.get("required", []))
            expected_required = set(expected.get("x-response-required", []))
            if actual_required != expected_required:
                failures.append(
                    f"required-field drift for {method.upper()} {path}: "
                    f"missing={sorted(expected_required - actual_required)}, "
                    f"extra={sorted(actual_required - expected_required)}"
                )
            actual_types = {
                name: _type_name(property_schema)
                for name, property_schema in actual_model.get("properties", {}).items()
            }
            expected_types = expected.get("x-response-types", {})
            if actual_types != expected_types:
                failures.append(
                    f"response-type drift for {method.upper()} {path}: "
                    f"expected={expected_types}, generated={actual_types}"
                )

    if failures:
        print("Contract drift detected:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"Contract matches generated OpenAPI ({len(contract['paths'])} versioned paths).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
