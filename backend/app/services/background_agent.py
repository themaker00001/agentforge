"""
Background Agent Service
Persistent in-memory task queue using asyncio.Queue.
Tasks run the same execute() generator as normal flow execution
and store aggregated log output as the result.
"""

from __future__ import annotations
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.schema import BackgroundTask, FlowGraph, TaskStatus

# ── In-memory store ───────────────────────────────────────────────────────────

_tasks: dict[str, BackgroundTask] = {}
_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)

# ── Public API ────────────────────────────────────────────────────────────────


async def submit_task(flow: FlowGraph, user_input: str) -> str:
    """Enqueue a new background task. Returns the task_id."""
    task_id = str(uuid.uuid4())
    task = BackgroundTask(
        task_id=task_id,
        status=TaskStatus.pending,
        result=None,
        created_at=datetime.now(timezone.utc).isoformat(),
        flow=flow,
        user_input=user_input,
    )
    _tasks[task_id] = task
    await _queue.put(task_id)
    return task_id


def get_task(task_id: str) -> Optional[BackgroundTask]:
    """Return task by ID, or None if not found."""
    return _tasks.get(task_id)


def list_tasks() -> list[BackgroundTask]:
    """Return all tasks, newest first."""
    return sorted(_tasks.values(), key=lambda t: t.created_at, reverse=True)


def delete_task(task_id: str) -> bool:
    """Remove a task from the store. Returns True if it existed."""
    if task_id in _tasks:
        del _tasks[task_id]
        return True
    return False


# ── Worker loop ───────────────────────────────────────────────────────────────


async def worker_loop() -> None:
    """
    Persistent asyncio background worker.
    Picks tasks off the queue one at a time and executes them.
    Should be started as an asyncio task in main.py lifespan.
    """
    from app.services.executor import execute  # local import to avoid circular deps

    print("🔄 Background agent worker started.")
    while True:
        task_id = await _queue.get()
        task = _tasks.get(task_id)
        if task is None:
            _queue.task_done()
            continue

        # Mark running
        _tasks[task_id] = task.model_copy(update={"status": TaskStatus.running})

        log_lines: list[str] = []
        try:
            async for event in execute(
                graph=task.flow,
                user_input=task.user_input,
                model="ollama:llama3:8b",
                session_id=f"bg-{task_id}",
            ):
                msg = event.get("message", "")
                if msg:
                    log_lines.append(msg)

            aggregated = "\n".join(log_lines)
            _tasks[task_id] = _tasks[task_id].model_copy(
                update={"status": TaskStatus.done, "result": aggregated}
            )
        except Exception as exc:
            _tasks[task_id] = _tasks[task_id].model_copy(
                update={"status": TaskStatus.error, "result": f"Error: {exc}"}
            )
        finally:
            _queue.task_done()
