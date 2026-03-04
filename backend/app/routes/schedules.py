"""Schedules router  CRUD for cron-triggered flows."""

import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import schedule_store
from app.services.scheduler import calc_next_run

router = APIRouter(prefix="/schedules", tags=["Schedules"])


class CreateScheduleRequest(BaseModel):
    name: str = "Untitled Schedule"
    cron_expr: str
    user_input: str = ""
    model: str = "ollama:llama3:8b"
    flow_json: str  # JSON-serialized FlowGraph


@router.get("")
def list_schedules():
    return schedule_store.list_schedules()


@router.post("")
def create_schedule(req: CreateScheduleRequest):
    try:
        next_run = calc_next_run(req.cron_expr)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception:
        raise HTTPException(400, "Invalid cron expression")

    schedule_id = str(uuid.uuid4())
    return schedule_store.create_schedule(
        schedule_id=schedule_id,
        name=req.name,
        cron_expr=req.cron_expr,
        user_input=req.user_input,
        model=req.model,
        flow_json=req.flow_json,
        next_run=next_run,
    )


@router.put("/{schedule_id}/toggle")
def toggle_schedule(schedule_id: str):
    result = schedule_store.toggle_schedule(schedule_id)
    if not result:
        raise HTTPException(404, "Schedule not found")
    return result


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str):
    if not schedule_store.delete_schedule(schedule_id):
        raise HTTPException(404, "Schedule not found")
    return {"ok": True}
