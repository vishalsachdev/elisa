"""Manages Git operations for build sessions."""


class GitService:
    """Handles repo init, commits, and branch management."""

    def init_repo(self, path: str) -> None:
        """Initialize a git repo at the given path."""
        raise NotImplementedError

    def commit(self, path: str, message: str) -> str:
        """Create a commit and return the SHA."""
        raise NotImplementedError
