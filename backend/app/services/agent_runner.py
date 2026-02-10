"""Runs individual AI agents (builder, tester, reviewer)."""


class AgentRunner:
    """Executes a single agent task using Claude."""

    async def execute(self, task_id: str, prompt: str) -> str:
        """Run an agent with the given prompt and return the result."""
        raise NotImplementedError
