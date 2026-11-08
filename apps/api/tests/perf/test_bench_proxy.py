import asyncio

from scripts.bench_proxy import run_benchmark


def test_proxy_benchmark_compares_mock_latency_and_detection_during_traffic() -> None:
    report = asyncio.run(run_benchmark(requests=2, detection_rows=100))

    assert report["proxy"]["requests"] == 2
    assert isinstance(report["proxy"]["added_latency_p50_ms"], float)
    assert isinstance(report["proxy"]["added_latency_p95_ms"], float)
    assert report["detection"]["rows"] == 100
    assert report["detection"]["concurrent_proxy_requests"] > 0
