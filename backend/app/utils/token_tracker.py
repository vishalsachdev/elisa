"""Tracks token usage across the build session."""


class TokenTracker:
    """Aggregates token counts for cost tracking and display."""

    def __init__(self) -> None:
        self.input_tokens: int = 0
        self.output_tokens: int = 0

    def add(self, input_tokens: int, output_tokens: int) -> None:
        """Add token counts from an API call."""
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens

    @property
    def total(self) -> int:
        """Total tokens used."""
        return self.input_tokens + self.output_tokens
