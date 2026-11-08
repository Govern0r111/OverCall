import ast
import json
from pathlib import Path

from overcall.v1_api import _snippets


def test_provider_snippets_match_shared_proxy_routes() -> None:
    routes_file = (
        Path(__file__).resolve().parents[4]
        / "contract"
        / "fixtures"
        / "proxy"
        / "routes.json"
    )
    routes = json.loads(routes_file.read_text(encoding="utf-8"))

    for provider, samples in routes.items():
        base_url = f"https://proxy.example/proxy/{provider}/v1"
        snippets = _snippets(provider, base_url)

        assert len(snippets) == len(samples) * 3
        assert all("YOUR_OVERCALL_KEY" in snippet["code"] for snippet in snippets)
        for sample in samples:
            route_url = f"{base_url}{sample['path']}"
            assert sum(route_url in snippet["code"] for snippet in snippets) == 3
            assert sum(sample["method"] in snippet["code"] for snippet in snippets) >= 1
        ast.parse(next(snippet["code"] for snippet in snippets if snippet["id"] == "python"))


def test_provider_snippets_reference_provider_credentials_from_environment() -> None:
    openai = _snippets("openai", "https://proxy.example/proxy/openai/v1")
    stripe = _snippets("stripe", "https://proxy.example/proxy/stripe/v1")

    assert all("OPENAI_API_KEY" in snippet["code"] for snippet in openai)
    assert all("STRIPE_TEST_KEY" in snippet["code"] for snippet in stripe)
