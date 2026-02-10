"""Task DAG utilities using graphlib."""

from graphlib import TopologicalSorter


class TaskDAG:
    """Wraps TopologicalSorter for task dependency management."""

    def __init__(self) -> None:
        self._graph: dict[str, set[str]] = {}

    def add_task(self, task_id: str, dependencies: list[str] | None = None) -> None:
        """Add a task with optional dependencies."""
        self._graph[task_id] = set(dependencies or [])

    def get_order(self) -> list[str]:
        """Return tasks in topological order."""
        sorter = TopologicalSorter(self._graph)
        return list(sorter.static_order())

    def get_ready(self, completed: set[str]) -> list[str]:
        """Return tasks that are ready to execute given completed set."""
        ready = []
        for task_id, deps in self._graph.items():
            if task_id not in completed and deps.issubset(completed):
                ready.append(task_id)
        return ready
