"""
Tool Manager — built-in tools registry and execution.
Each tool is a simple async function: (params: dict) → str
"""

import asyncio
import csv
import httpx
import io
import json
import math
import operator
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote_plus
from ddgs import DDGS

SANDBOX_DIR = Path("/tmp/agentforge")
SANDBOX_DIR.mkdir(exist_ok=True)


# ── Tool implementations ──────────────────────────────────────────────────────

async def _web_search(params: dict) -> str:
    query = params.get("query", "").strip()
    if not query:
        return "No query provided."
    # Sanitize: collapse whitespace/newlines, limit to 200 chars
    query = re.sub(r'\s+', ' ', query)[:200]
    try:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            lambda: list(DDGS().text(query, max_results=5))
        )
        if not results:
            return "No results found."
        lines = []
        for r in results:
            title = r.get("title", "")
            href  = r.get("href", "")
            body  = r.get("body", "")
            lines.append(f"• {title}\n  {href}\n  {body}")
        return "\n\n".join(lines)
    except Exception as e:
        return f"Search failed: {e}"


async def _http_request(params: dict) -> str:
    url    = params.get("url", "")
    method = params.get("method", "GET").upper()
    body   = params.get("body", None)
    if not url:
        return "No URL provided."
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        try:
            if method == "POST":
                resp = await client.post(url, json=body)
            else:
                resp = await client.get(url)
            return resp.text[:2000]
        except Exception as e:
            return f"HTTP request failed: {e}"


async def _code_runner(params: dict) -> str:
    code = params.get("code", "")
    if not code:
        return "No code provided."
    script = SANDBOX_DIR / "script.py"
    script.write_text(code)
    try:
        result = subprocess.run(
            ["python3", str(script)],
            capture_output=True, text=True, timeout=10,
        )
        out = result.stdout[:1500]
        err = result.stderr[:500]
        return out if out else (f"STDERR: {err}" if err else "(no output)")
    except subprocess.TimeoutExpired:
        return "Code execution timed out (10s limit)."
    except Exception as e:
        return f"Code runner error: {e}"


async def _file_reader(params: dict) -> str:
    filename = params.get("filename", "")
    if not filename:
        return "No filename provided."
    target = SANDBOX_DIR / Path(filename).name   # sandbox-only
    if not target.exists():
        return f"File not found in sandbox: {filename}"
    return target.read_text()[:3000]


async def _summarize(params: dict) -> str:
    """Stub — in real usage the agent service handles summarization via LLM."""
    text = params.get("text", "")
    if not text:
        return "Nothing to summarize."
    return text[:300] + ("…" if len(text) > 300 else "")


async def _json_parse(params: dict) -> str:
    """Parse a JSON string and return a prettified or queried version."""
    text  = params.get("text", "") or params.get("json", "")
    query = params.get("query", "")   # optional dot-path like "data.items.0.name"
    if not text:
        return "No JSON text provided."
    try:
        data = json.loads(text)
        if query:
            parts = query.strip(".").split(".")
            for part in parts:
                if isinstance(data, list):
                    data = data[int(part)]
                elif isinstance(data, dict):
                    data = data[part]
                else:
                    return f"Cannot traverse into {type(data).__name__} at '{part}'"
        return json.dumps(data, indent=2, ensure_ascii=False)
    except json.JSONDecodeError as e:
        return f"JSON parse error: {e}"
    except (KeyError, IndexError, ValueError) as e:
        return f"Query error: {e}"


async def _csv_reader(params: dict) -> str:
    """Read a CSV file from sandbox or inline text and return as JSON array."""
    filename = params.get("filename", "")
    text     = params.get("text", "")
    delimiter = params.get("delimiter", ",")
    max_rows  = int(params.get("max_rows", 100))

    if filename:
        target = SANDBOX_DIR / Path(filename).name
        if not target.exists():
            return f"File not found in sandbox: {filename}"
        text = target.read_text()

    if not text:
        return "No CSV data provided."

    try:
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        rows = [row for row in reader][:max_rows]
        return json.dumps(rows, indent=2, ensure_ascii=False)
    except Exception as e:
        return f"CSV read error: {e}"


async def _text_splitter(params: dict) -> str:
    """Split text into chunks and return as JSON array of strings."""
    text       = params.get("text", "")
    chunk_size = int(params.get("chunk_size", 500))
    overlap    = int(params.get("overlap", 50))
    mode       = params.get("mode", "chars")   # "chars" | "lines" | "sentences"

    if not text:
        return "No text provided."

    if mode == "lines":
        lines = [l for l in text.split("\n") if l.strip()]
        return json.dumps(lines, ensure_ascii=False)

    if mode == "sentences":
        sentences = re.split(r'(?<=[.!?])\s+', text.strip())
        return json.dumps(sentences, ensure_ascii=False)

    # Default: character-based chunks with overlap
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return json.dumps(chunks, ensure_ascii=False)


async def _calculator(params: dict) -> str:
    """Evaluate a safe mathematical expression."""
    expr = params.get("expression", "") or params.get("expr", "")
    if not expr:
        return "No expression provided."

    # Restrict to safe characters and functions
    safe_names = {
        "abs": abs, "round": round, "min": min, "max": max,
        "sum": sum, "pow": pow,
        "sqrt": math.sqrt, "ceil": math.ceil, "floor": math.floor,
        "log": math.log, "log10": math.log10,
        "sin": math.sin, "cos": math.cos, "tan": math.tan,
        "pi": math.pi, "e": math.e,
    }
    try:
        result = eval(expr, {"__builtins__": {}}, safe_names)  # noqa: S307
        if isinstance(result, float) and result.is_integer():
            return str(int(result))
        return str(result)
    except Exception as e:
        return f"Calculation error: {e}"


async def _datetime_helper(params: dict) -> str:
    """Return date/time information."""
    action = params.get("action", "now")   # "now" | "format" | "diff"
    fmt    = params.get("format", "%Y-%m-%d %H:%M:%S UTC")

    if action == "now":
        now = datetime.now(timezone.utc)
        return now.strftime(fmt)

    if action == "format":
        date_str = params.get("date", "")
        if not date_str:
            return "No date string provided."
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            return dt.strftime(fmt)
        except Exception as e:
            return f"Date format error: {e}"

    if action == "diff":
        date1_str = params.get("date1", "")
        date2_str = params.get("date2", "")
        if not date1_str or not date2_str:
            return "Provide date1 and date2 for diff."
        try:
            d1 = datetime.fromisoformat(date1_str.replace("Z", "+00:00"))
            d2 = datetime.fromisoformat(date2_str.replace("Z", "+00:00"))
            delta = abs((d2 - d1).total_seconds())
            days    = int(delta // 86400)
            hours   = int((delta % 86400) // 3600)
            minutes = int((delta % 3600) // 60)
            return f"{days}d {hours}h {minutes}m"
        except Exception as e:
            return f"Diff error: {e}"

    return f"Unknown action: {action}. Use 'now', 'format', or 'diff'."


# ── Registry ─────────────────────────────────────────────────────────────────

TOOLS: dict[str, callable] = {
    "web_search":      _web_search,
    "http_request":    _http_request,
    "code_runner":     _code_runner,
    "file_reader":     _file_reader,
    "summarize":       _summarize,
    "json_parse":      _json_parse,
    "csv_reader":      _csv_reader,
    "text_splitter":   _text_splitter,
    "calculator":      _calculator,
    "datetime_helper": _datetime_helper,
}


def list_tools() -> list[str]:
    return list(TOOLS.keys())


async def run_tool(tool_name: str, params: dict) -> str:
    """Execute a tool by name. Returns its string result."""
    fn = TOOLS.get(tool_name)
    if not fn:
        return f"Unknown tool: '{tool_name}'. Available: {list_tools()}"
    try:
        return await fn(params)
    except Exception as e:
        return f"[Tool error: {tool_name}] {e}"
