"""
Runs Route — GET /runs, GET /runs/{run_id}, DELETE /runs/{run_id}
"""

from fastapi import APIRouter, HTTPException

from app.services import run_store

router = APIRouter(prefix="/runs", tags=["Runs"])


@router.get("")
async def list_runs(limit: int = 50):
    """Return a list of past run summaries (newest first)."""
    return run_store.list_runs(limit=limit)


@router.get("/{run_id}")
async def get_run(run_id: str):
    """Return full run record including events_json for replay."""
    record = run_store.get_run(run_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return record


@router.delete("/{run_id}")
async def delete_run(run_id: str):
    """Delete a run record."""
    deleted = run_store.delete_run(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return {"deleted": True, "run_id": run_id}
