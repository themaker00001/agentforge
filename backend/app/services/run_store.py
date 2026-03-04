"""
Run Store  SQLite-backed persistence for flow execution records.

DB file: agentforge_runs.db (in the backend root directory)
Table:   flow_runs
  run_id          TEXT PRIMARY KEY
  created_at      TEXT (ISO-8601 UTC)
  user_input      TEXT
  model           TEXT
  flow_json       TEXT (JSON serialization of FlowGraph)
  events_json     TEXT (JSON array of LogEvent dicts)
  total_cost_usd  REAL
  duration_ms     INTEGER
  node_count      INTEGER
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent.parent / "agentforge_runs.db"


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the flow_runs table if it doesn't exist. Call on startup."""
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS flow_runs (
                run_id         TEXT PRIMARY KEY,
                created_at     TEXT NOT NULL,
                user_input     TEXT NOT NULL DEFAULT '',
                model          TEXT NOT NULL DEFAULT '',
                flow_json      TEXT NOT NULL DEFAULT '{}',
                events_json    TEXT NOT NULL DEFAULT '[]',
                total_cost_usd REAL NOT NULL DEFAULT 0.0,
                duration_ms    INTEGER NOT NULL DEFAULT 0,
                node_count     INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.commit()


def save_run(
    run_id: str,
    user_input: str,
    model: str,
    flow_json: str,
    events: list[dict],
    total_cost_usd: float,
    duration_ms: int,
    node_count: int,
) -> dict:
    """Insert a new run record. Returns the stored row as a dict."""
    now = datetime.now(timezone.utc).isoformat()
    events_json = json.dumps(events)
    with _conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO flow_runs
                (run_id, created_at, user_input, model, flow_json,
                 events_json, total_cost_usd, duration_ms, node_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (run_id, now, user_input, model, flow_json,
             events_json, total_cost_usd, duration_ms, node_count),
        )
        conn.commit()
    return {
        "run_id": run_id,
        "created_at": now,
        "user_input": user_input,
        "model": model,
        "total_cost_usd": total_cost_usd,
        "duration_ms": duration_ms,
        "node_count": node_count,
    }


def list_runs(limit: int = 50) -> list[dict]:
    """Return run summaries (no events_json/flow_json) newest first."""
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT run_id, created_at, user_input, model,
                   total_cost_usd, duration_ms, node_count
            FROM flow_runs
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_run(run_id: str) -> dict | None:
    """Return a full run record including events_json."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM flow_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
    return dict(row) if row else None


def delete_run(run_id: str) -> bool:
    with _conn() as conn:
        cursor = conn.execute("DELETE FROM flow_runs WHERE run_id = ?", (run_id,))
        conn.commit()
    return cursor.rowcount > 0
