"""
Memory Service
- Short-term: in-process dict keyed by session_id (cleared on restart)
- Long-term: JSON file at ~/.agentforge/memory/<session_id>.json
"""

import json
import os
from pathlib import Path
from datetime import datetime

_short_term: dict[str, list[dict]] = {}

MEMORY_DIR = Path.home() / ".agentforge" / "memory"


def _session_file(session_id: str) -> Path:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    return MEMORY_DIR / f"{session_id}.json"


# ── Short-term ────────────────────────────────────────────────────────────────

def store_short(session_id: str, role: str, content: str) -> None:
    if session_id not in _short_term:
        _short_term[session_id] = []
    _short_term[session_id].append({
        "role": role,
        "content": content,
        "ts": datetime.utcnow().isoformat(),
    })
    # Keep last 20 turns
    _short_term[session_id] = _short_term[session_id][-20:]


def get_short(session_id: str) -> list[dict]:
    return _short_term.get(session_id, [])


def clear_short(session_id: str) -> None:
    _short_term.pop(session_id, None)


# ── Long-term ─────────────────────────────────────────────────────────────────

def store_long(session_id: str, key: str, value: str) -> None:
    path = _session_file(session_id)
    data: dict = {}
    if path.exists():
        data = json.loads(path.read_text())
    data[key] = {"value": value, "ts": datetime.utcnow().isoformat()}
    path.write_text(json.dumps(data, indent=2))


def get_long(session_id: str) -> dict:
    path = _session_file(session_id)
    if not path.exists():
        return {}
    return json.loads(path.read_text())


# ── Context injection ─────────────────────────────────────────────────────────

def inject_context(session_id: str, messages: list[dict]) -> list[dict]:
    """
    Prepend short-term conversation history as a system recap.
    Returns a new messages list.
    """
    history = get_short(session_id)
    if not history:
        return messages

    recap = "Previous conversation:\n" + "\n".join(
        f"  {m['role']}: {m['content'][:200]}" for m in history[-6:]
    )
    system_recap = {"role": "system", "content": recap}

    # Insert after any existing system message
    result = list(messages)
    if result and result[0]["role"] == "system":
        return [result[0], system_recap] + result[1:]
    return [system_recap] + result
