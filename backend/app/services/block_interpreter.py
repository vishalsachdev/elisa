"""Server-side block spec validation."""


def validate_spec(spec: dict) -> bool:
    """Validate a project spec received from the frontend."""
    return bool(spec.get("project", {}).get("goal"))
