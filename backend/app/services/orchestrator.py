"""Orchestrates the build pipeline: planning, execution, testing, deployment."""


class Orchestrator:
    """Manages the lifecycle of a build session."""

    async def run(self, session_id: str, spec: dict) -> None:
        """Execute the full build pipeline for a session."""
        raise NotImplementedError
