"""Schedule Store  SQLite-backed cron job persistence."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent.parent / "agentforge_schedules.db"


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scheduled_flows (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL DEFAULT '',
                cron_expr  TEXT NOT NULL,
                user_input TEXT NOT NULL DEFAULT '',
                model      TEXT NOT NULL DEFAULT '',
                flow_json  TEXT NOT NULL DEFAULT '{}',
                enabled    INTEGER NOT NULL DEFAULT 1,
                next_run   TEXT,
                last_run   TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()


def list_schedules() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM scheduled_flows ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_schedule(schedule_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM scheduled_flows WHERE id = ?", (schedule_id,)
        ).fetchone()
    return dict(row) if row else None


def create_schedule(
    schedule_id: str,
    name: str,
    cron_expr: str,
    user_input: str,
    model: str,
    flow_json: str,
    next_run: str,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO scheduled_flows
                (id, name, cron_expr, user_input, model, flow_json, enabled, next_run, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (schedule_id, name, cron_expr, user_input, model, flow_json, next_run, now),
        )
        conn.commit()
    return get_schedule(schedule_id)


def update_after_run(schedule_id: str, next_run: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute(
            "UPDATE scheduled_flows SET last_run = ?, next_run = ? WHERE id = ?",
            (now, next_run, schedule_id),
        )
        conn.commit()


def toggle_schedule(schedule_id: str) -> dict | None:
    sched = get_schedule(schedule_id)
    if not sched:
        return None
    new_enabled = 0 if sched["enabled"] else 1
    with _conn() as conn:
        conn.execute(
            "UPDATE scheduled_flows SET enabled = ? WHERE id = ?",
            (new_enabled, schedule_id),
        )
        conn.commit()
    return get_schedule(schedule_id)


def delete_schedule(schedule_id: str) -> bool:
    with _conn() as conn:
        cursor = conn.execute("DELETE FROM scheduled_flows WHERE id = ?", (schedule_id,))
        conn.commit()
    return cursor.rowcount > 0


def get_due_schedules(now: datetime) -> list[dict]:
    """Return enabled schedules whose next_run <= now."""
    now_iso = now.isoformat()
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT * FROM scheduled_flows
            WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?
            """,
            (now_iso,),
        ).fetchall()
    return [dict(r) for r in rows]
