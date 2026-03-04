"""
Deploy Store  SQLite-backed persistence for deployed workflow APIs.

DB file: agentforge_deploys.db (in the backend root directory)
Table:   deployed_apis
  slug        TEXT PRIMARY KEY
  flow_json   TEXT (JSON serialization of FlowGraph)
  model       TEXT
  api_key_hash TEXT | NULL  (SHA-256 hex digest of the raw API key, or NULL)
  created_at  TEXT (ISO-8601 UTC)
"""

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent.parent / "agentforge_deploys.db"


#  Helpers 

def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_key(raw: str) -> str:
    """Return SHA-256 hex digest of a plain-text API key."""
    return hashlib.sha256(raw.encode()).hexdigest()


def verify_key(raw: str, stored_hash: str) -> bool:
    return hash_key(raw) == stored_hash


#  Lifecycle 

def init_db() -> None:
    """Create the deployed_apis table if it doesn't exist. Call on startup."""
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS deployed_apis (
                slug         TEXT PRIMARY KEY,
                flow_json    TEXT NOT NULL,
                model        TEXT NOT NULL,
                api_key_hash TEXT,
                created_at   TEXT NOT NULL
            )
        """)
        conn.commit()


#  CRUD 

def save_deploy(slug: str, flow_json: str, model: str, api_key: str | None) -> dict:
    """Insert or replace a deployment. Returns the stored row as a dict."""
    key_hash = hash_key(api_key) if api_key else None
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO deployed_apis (slug, flow_json, model, api_key_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                flow_json    = excluded.flow_json,
                model        = excluded.model,
                api_key_hash = excluded.api_key_hash,
                created_at   = excluded.created_at
            """,
            (slug, flow_json, model, key_hash, now),
        )
        conn.commit()
    return {
        "slug": slug,
        "model": model,
        "has_api_key": key_hash is not None,
        "created_at": now,
        "endpoint_url": f"http://localhost:8000/api/{slug}",
    }


def get_deploy(slug: str) -> sqlite3.Row | None:
    with _conn() as conn:
        return conn.execute(
            "SELECT * FROM deployed_apis WHERE slug = ?", (slug,)
        ).fetchone()


def list_deploys() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT slug, model, api_key_hash, created_at FROM deployed_apis ORDER BY created_at DESC"
        ).fetchall()
    return [
        {
            "slug": r["slug"],
            "model": r["model"],
            "has_api_key": bool(r["api_key_hash"]),
            "created_at": r["created_at"],
            "endpoint_url": f"http://localhost:8000/api/{r['slug']}",
        }
        for r in rows
    ]


def delete_deploy(slug: str) -> bool:
    with _conn() as conn:
        cursor = conn.execute("DELETE FROM deployed_apis WHERE slug = ?", (slug,))
        conn.commit()
    return cursor.rowcount > 0
