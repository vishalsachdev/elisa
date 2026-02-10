"""Manages context windows and token budgets for agent calls."""


class ContextManager:
    """Tracks and manages context across agent invocations."""

    def __init__(self, max_tokens: int = 100000) -> None:
        self.max_tokens = max_tokens
        self._usage: dict[str, int] = {}

    def track(self, agent_name: str, tokens_used: int) -> None:
        """Record token usage for an agent."""
        self._usage[agent_name] = self._usage.get(agent_name, 0) + tokens_used

    def get_usage(self) -> dict[str, int]:
        """Return token usage by agent."""
        return dict(self._usage)
