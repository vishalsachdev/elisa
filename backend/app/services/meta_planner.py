"""Decomposes a project spec into a task DAG using Claude."""


class MetaPlanner:
    """Takes a ProjectSpec and produces a list of tasks with dependencies."""

    async def plan(self, spec: dict) -> list[dict]:
        """Generate a task plan from a project spec."""
        raise NotImplementedError
