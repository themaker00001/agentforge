"""Async cron scheduler for AgentForge flows.

Runs as a background asyncio task (started in lifespan).
Checks for due schedules every 60 seconds and triggers execution.
"""

import asyncio
import json
from datetime import datetime, timezone

try:
    from croniter import croniter
    _HAS_CRONITER = True
except ImportError:
    _HAS_CRONITER = False

from app.services import schedule_store


def calc_next_run(cron_expr: str, base: datetime | None = None) -> str:
    """Calculate the next run time for a cron expression. Returns ISO-8601 UTC string."""
    if not _HAS_CRONITER:
        raise RuntimeError("croniter not installed  run: pip install croniter")
    base = base or datetime.now(timezone.utc)
    it = croniter(cron_expr, base)
    nxt = it.get_next(datetime)
    if nxt.tzinfo is None:
        nxt = nxt.replace(tzinfo=timezone.utc)
    return nxt.isoformat()


async def _execute_schedule(sched: dict) -> None:
    """Execute a scheduled flow using the executor service directly."""
    from app.services.executor import execute
    from app.models.schema import FlowGraph
    try:
        flow_data = json.loads(sched["flow_json"])
        graph = FlowGraph(**flow_data)
        events = []
        async for event in execute(
            graph,
            sched["user_input"],
            sched["model"],
            f"schedule_{sched['id']}",
        ):
            events.append(event)
        print(f" Schedule '{sched['name']}' completed  {len(events)} events")
    except Exception as e:
        print(f" Schedule '{sched['name']}' failed: {e}")


async def scheduler_loop() -> None:
    """Background task: poll for due schedules every 60 seconds."""
    if not _HAS_CRONITER:
        print("  croniter not installed  scheduler disabled. Run: pip install croniter")
        return

    print(" AgentForge scheduler started")
    while True:
        try:
            now = datetime.now(timezone.utc)
            due = schedule_store.get_due_schedules(now)
            for sched in due:
                asyncio.create_task(_execute_schedule(sched))
                try:
                    next_run = calc_next_run(sched["cron_expr"], now)
                except Exception:
                    next_run = ""
                schedule_store.update_after_run(sched["id"], next_run)
                print(f" Triggered '{sched['name']}'  next: {next_run}")
        except Exception as e:
            print(f" Scheduler error: {e}")
        await asyncio.sleep(60)
