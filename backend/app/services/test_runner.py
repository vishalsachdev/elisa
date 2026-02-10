"""Runs tests for generated projects."""


class TestRunner:
    """Executes test suites and reports results."""

    async def run_tests(self, project_path: str) -> dict:
        """Run tests and return results."""
        raise NotImplementedError
