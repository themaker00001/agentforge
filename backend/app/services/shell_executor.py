"""
Shell Executor Service
Sandboxed command/script execution on the local machine.
- Working directory sandboxed to ~/agentforge_workspace
- Blocklist for dangerous commands
- Timeout via asyncio.wait_for
- Supports bash and python languages
"""

from __future__ import annotations
import asyncio
import os
import re
import sys
import tempfile
from pathlib import Path

# Sandbox base directory
WORKSPACE = Path.home() / "agentforge_workspace"

# Patterns that are never allowed, regardless of context
_BLOCKLIST: list[re.Pattern] = [
    re.compile(r"\brm\s+-rf\s+/", re.IGNORECASE),
    re.compile(r"\bsudo\b", re.IGNORECASE),
    re.compile(r"\bsu\s+-\b", re.IGNORECASE),
    re.compile(r"\bmkfs\b", re.IGNORECASE),
    re.compile(r"\bdd\s+if=", re.IGNORECASE),
    re.compile(r":\s*\(\s*\)\s*\{.*\}", re.IGNORECASE),  # fork bombs
    re.compile(r"\bchmod\s+777\s+/", re.IGNORECASE),
    re.compile(r"\bcurl\b.*\|\s*(?:ba)?sh", re.IGNORECASE),
    re.compile(r"\bwget\b.*\|\s*(?:ba)?sh", re.IGNORECASE),
    re.compile(r"\b(?:shutdown|reboot|halt|poweroff)\b", re.IGNORECASE),
]


def _ensure_workspace() -> Path:
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    return WORKSPACE


def _resolve_working_dir(working_dir: str | None) -> Path:
    base = _ensure_workspace()
    if not working_dir:
        return base
    # Resolve relative to workspace, block path traversal
    candidate = (base / working_dir).resolve()
    if not str(candidate).startswith(str(base)):
        raise ValueError(f"Working directory escapes sandbox: {working_dir!r}")
    candidate.mkdir(parents=True, exist_ok=True)
    return candidate


def _check_blocklist(command: str) -> None:
    for pattern in _BLOCKLIST:
        if pattern.search(command):
            raise ValueError(f"Command contains a blocked pattern: {pattern.pattern!r}")


async def run_shell(
    command: str,
    working_dir: str | None = None,
    timeout: int = 30,
    language: str = "bash",
) -> str:
    """
    Execute a shell command or script and return combined stdout + stderr.

    Args:
        command:     The command string (bash) or script body (python).
        working_dir: Directory relative to ~/agentforge_workspace.
        timeout:     Max execution time in seconds (default 30).
        language:    "bash" or "python".

    Returns:
        A string containing stdout and stderr output.

    Raises:
        ValueError: If the command triggers the blocklist or path traversal.
        TimeoutError: If execution exceeds the timeout.
    """
    if not command or not command.strip():
        return "(empty command)"

    _check_blocklist(command)
    cwd = _resolve_working_dir(working_dir)

    if language == "python":
        return await _run_python(command, cwd, timeout)
    else:
        return await _run_bash(command, cwd, timeout)


async def _run_bash(command: str, cwd: Path, timeout: int) -> str:
    async def _exec():
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(cwd),
        )
        stdout, stderr = await proc.communicate()
        out = stdout.decode(errors="replace")
        err = stderr.decode(errors="replace")
        parts = []
        if out.strip():
            parts.append(out.strip())
        if err.strip():
            parts.append(f"[stderr]\n{err.strip()}")
        if not parts:
            return f"(exit code {proc.returncode})"
        return "\n".join(parts)

    try:
        return await asyncio.wait_for(_exec(), timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError(f"Command timed out after {timeout}s")


async def _run_python(script: str, cwd: Path, timeout: int) -> str:
    async def _exec():
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", dir=str(cwd), delete=False
        ) as f:
            f.write(script)
            tmpfile = f.name

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, tmpfile,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(cwd),
            )
            stdout, stderr = await proc.communicate()
        finally:
            try:
                os.unlink(tmpfile)
            except OSError:
                pass

        out = stdout.decode(errors="replace")
        err = stderr.decode(errors="replace")
        parts = []
        if out.strip():
            parts.append(out.strip())
        if err.strip():
            parts.append(f"[stderr]\n{err.strip()}")
        if not parts:
            return f"(exit code {proc.returncode})"
        return "\n".join(parts)

    try:
        return await asyncio.wait_for(_exec(), timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError(f"Python script timed out after {timeout}s")
