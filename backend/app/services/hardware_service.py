"""Manages ESP32 compilation and flashing."""


class HardwareService:
    """Handles hardware-targeted builds and deployment."""

    async def compile(self, project_path: str) -> str:
        """Compile project for ESP32 target."""
        raise NotImplementedError

    async def flash(self, firmware_path: str) -> bool:
        """Flash firmware to connected ESP32."""
        raise NotImplementedError
