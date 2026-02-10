from enum import Enum

from pydantic import BaseModel


class AgentRole(str, Enum):
    builder = "builder"
    tester = "tester"
    reviewer = "reviewer"
    custom = "custom"


class AgentStatus(str, Enum):
    idle = "idle"
    working = "working"
    done = "done"
    error = "error"


class Agent(BaseModel):
    name: str
    role: AgentRole
    persona: str = ""
    status: AgentStatus = AgentStatus.idle
