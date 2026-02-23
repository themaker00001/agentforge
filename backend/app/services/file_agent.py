"""
File System Agent Service
Safe local file operations sandboxed to ~/agentforge_workspace.
Operations: read, write, list (directory listing), search (glob pattern)
"""

from __future__ import annotations
import glob as glob_module
from pathlib import Path

# Sandbox base directory — same as shell_executor uses
WORKSPACE = Path.home() / "agentforge_workspace"


def _ensure_workspace() -> Path:
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    return WORKSPACE


def _safe_resolve(path: str | None) -> Path:
    """
    Resolve a user-supplied path relative to the workspace.
    Raises ValueError if the path escapes the sandbox.
    """
    base = _ensure_workspace()
    if not path or not path.strip():
        return base
    # Strip leading slashes to keep it relative
    clean = path.lstrip("/")
    candidate = (base / clean).resolve()
    if not str(candidate).startswith(str(base.resolve())):
        raise ValueError(f"Path escapes sandbox: {path!r}")
    return candidate


async def run_fs_operation(
    operation: str,
    path: str | None = None,
    content: str | None = None,
    pattern: str | None = None,
) -> str:
    """
    Execute a file system operation and return a string result.

    Args:
        operation: "read" | "write" | "list" | "search"
        path:      Target file/directory path (relative to workspace).
        content:   Content to write (for write operation).
        pattern:   Glob pattern for search/list.

    Returns:
        String result suitable for passing to downstream nodes.

    Raises:
        ValueError: On bad paths, missing args, or unknown operations.
    """
    op = (operation or "").lower().strip()

    if op == "read":
        return await _read(path)
    elif op == "write":
        return await _write(path, content)
    elif op == "list":
        return await _list(path, pattern)
    elif op == "search":
        return await _search(pattern)
    else:
        raise ValueError(f"Unknown file system operation: {operation!r}. Use read|write|list|search.")


async def _read(path: str | None) -> str:
    if not path:
        raise ValueError("fsPath is required for 'read' operation.")
    target = _safe_resolve(path)
    if not target.exists():
        raise FileNotFoundError(f"File not found in workspace: {path!r}")
    if not target.is_file():
        raise ValueError(f"Path is not a file: {path!r}")
    text = target.read_text(encoding="utf-8", errors="replace")
    return f"[read: {path}]\n{text}"


async def _write(path: str | None, content: str | None) -> str:
    if not path:
        raise ValueError("fsPath is required for 'write' operation.")
    if content is None:
        content = ""
    target = _safe_resolve(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"[write: {path}] Written {len(content)} characters."


async def _list(path: str | None, pattern: str | None) -> str:
    target = _safe_resolve(path) if path else _ensure_workspace()
    if not target.exists():
        raise FileNotFoundError(f"Directory not found: {path!r}")
    if not target.is_dir():
        raise ValueError(f"Path is not a directory: {path!r}")

    if pattern:
        matches = list(target.glob(pattern))
    else:
        matches = list(target.iterdir())

    if not matches:
        return f"[list: {target.relative_to(WORKSPACE)}] (empty)"

    lines = []
    for p in sorted(matches):
        rel = p.relative_to(WORKSPACE)
        kind = "DIR " if p.is_dir() else "FILE"
        lines.append(f"  {kind}  {rel}")
    return f"[list: {target.relative_to(WORKSPACE)}]\n" + "\n".join(lines)


async def _search(pattern: str | None) -> str:
    if not pattern:
        raise ValueError("fsPattern is required for 'search' operation.")
    base = _ensure_workspace()
    # Use glob relative to workspace
    full_pattern = str(base / "**" / pattern)
    matches = glob_module.glob(full_pattern, recursive=True)
    # Filter to only within workspace
    safe_matches = [m for m in matches if m.startswith(str(base))]
    if not safe_matches:
        return f"[search: {pattern}] No matches found."
    lines = [f"  {Path(m).relative_to(base)}" for m in sorted(safe_matches)]
    return f"[search: {pattern}]\n" + "\n".join(lines)
