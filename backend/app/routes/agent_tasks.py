"""
Background Agent Task Routes
POST   /agent-tasks          — submit a background task
GET    /agent-tasks          — list all tasks
GET    /agent-tasks/{id}     — get task status + result
DELETE /agent-tasks/{id}     — remove a task
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.schema import BackgroundTask, FlowGraph
from app.services import background_agent as bg_svc

router = APIRouter(prefix="/agent-tasks", tags=["Background Tasks"])


class SubmitTaskRequest(BaseModel):
    flow:      FlowGraph
    userInput: str = ""


class SubmitTaskResponse(BaseModel):
    task_id: str


@router.post("", response_model=SubmitTaskResponse, status_code=202)
async def submit_task(body: SubmitTaskRequest):
    """Enqueue a flow for background execution. Returns task_id immediately."""
    task_id = await bg_svc.submit_task(body.flow, body.userInput)
    return SubmitTaskResponse(task_id=task_id)


@router.get("", response_model=list[BackgroundTask])
async def list_tasks():
    """List all background tasks (newest first)."""
    return bg_svc.list_tasks()


@router.get("/{task_id}", response_model=BackgroundTask)
async def get_task(task_id: str):
    """Get status and result for a specific task."""
    task = bg_svc.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id!r} not found.")
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: str):
    """Remove a task from the store."""
    removed = bg_svc.delete_task(task_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Task {task_id!r} not found.")
