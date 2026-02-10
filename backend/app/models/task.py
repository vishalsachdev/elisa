from enum import Enum

from pydantic import BaseModel


class TaskStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    done = "done"
    failed = "failed"


class Task(BaseModel):
    id: str
    name: str
    description: str
    status: TaskStatus = TaskStatus.pending
    agent_name: str = ""
    dependencies: list[str] = []
    acceptance_criteria: list[str] = []
