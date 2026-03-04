"""Stats router  aggregate usage metrics across all runs."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

from app.services import run_store, schedule_store

router = APIRouter(prefix="/stats", tags=["Stats"])


@router.get("")
def get_stats():
    runs = run_store.list_runs(limit=5000)

    total_runs = len(runs)
    total_cost = sum(r.get("total_cost_usd", 0.0) for r in runs)
    total_duration = sum(r.get("duration_ms", 0) for r in runs)
    avg_duration = round(total_duration / total_runs) if total_runs else 0

    # Cost breakdown by model
    cost_by_model: dict[str, float] = defaultdict(float)
    runs_by_model: dict[str, int] = defaultdict(int)
    for r in runs:
        model = r.get("model", "unknown")
        cost_by_model[model] += r.get("total_cost_usd", 0.0)
        runs_by_model[model] += 1

    # Runs per day (last 7 days)
    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    runs_by_day: dict[str, int] = {d: 0 for d in days}
    cost_by_day: dict[str, float] = {d: 0.0 for d in days}
    for r in runs:
        day = (r.get("created_at") or "")[:10]
        if day in runs_by_day:
            runs_by_day[day] += 1
            cost_by_day[day] += r.get("total_cost_usd", 0.0)

    # Active schedules
    schedules = schedule_store.list_schedules()
    active_schedules = sum(1 for s in schedules if s.get("enabled"))

    return {
        "total_runs": total_runs,
        "total_cost_usd": round(total_cost, 6),
        "avg_duration_ms": avg_duration,
        "active_schedules": active_schedules,
        "models": [
            {
                "model": m,
                "runs": runs_by_model[m],
                "cost_usd": round(cost_by_model[m], 6),
            }
            for m in sorted(cost_by_model, key=lambda x: cost_by_model[x], reverse=True)
        ],
        "timeline": [
            {"date": d, "runs": runs_by_day[d], "cost": round(cost_by_day[d], 6)}
            for d in days
        ],
    }
