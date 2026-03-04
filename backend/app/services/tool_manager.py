"""
Tool Manager  built-in tools registry and execution.
Each tool is a simple async function: (params: dict)  str
"""

import asyncio
import csv
import difflib
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
from app.services import shell_executor as shell_svc

SANDBOX_DIR = Path("/tmp/agentforge")
SANDBOX_DIR.mkdir(exist_ok=True)
CUSTOM_TOOLS_FILE = Path.home() / ".agentforge" / "custom_tools.json"


#  Tool implementations 

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
            lines.append(f" {title}\n  {href}\n  {body}")
        return "\n\n".join(lines)
    except Exception as e:
        return f"Search failed: {e}"


async def _http_request(params: dict) -> str:
    url    = params.get("url", "")
    method = params.get("method", "GET").upper()
    body   = params.get("body", None)
    if isinstance(body, str):
        stripped = body.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                body = json.loads(stripped)
            except Exception:
                pass
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
    """Stub  in real usage the agent service handles summarization via LLM."""
    text = params.get("text", "")
    if not text:
        return "Nothing to summarize."
    return text[:300] + ("" if len(text) > 300 else "")


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


#  Registry 

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

_TOOL_CAPABILITIES: dict[str, dict] = {
    "web_search": {"category": "search_network", "purpose": "Search the web for recent information"},
    "http_request": {"category": "search_network", "purpose": "Call external HTTP APIs"},
    "code_runner": {"category": "code_files", "purpose": "Run Python snippets in sandbox"},
    "file_reader": {"category": "code_files", "purpose": "Read uploaded files from sandbox"},
    "summarize": {"category": "text", "purpose": "Summarize long text"},
    "json_parse": {"category": "data", "purpose": "Parse/query JSON payloads"},
    "csv_reader": {"category": "data", "purpose": "Read CSV text into structured JSON"},
    "text_splitter": {"category": "data", "purpose": "Split text into chunks"},
    "calculator": {"category": "data", "purpose": "Evaluate math expressions safely"},
    "datetime_helper": {"category": "data", "purpose": "Work with dates/times and diffs"},
}


def _safe_format(text: str, params: dict) -> str:
    class _SafeMap(dict):
        def __missing__(self, key):
            return "{" + key + "}"
    try:
        return text.format_map(_SafeMap(params or {}))
    except Exception:
        return text


def _render_value(value, params: dict):
    if isinstance(value, str):
        return _safe_format(value, params)
    if isinstance(value, dict):
        return {k: _render_value(v, params) for k, v in value.items()}
    if isinstance(value, list):
        return [_render_value(v, params) for v in value]
    return value


def _load_custom_tools() -> dict[str, dict]:
    CUSTOM_TOOLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not CUSTOM_TOOLS_FILE.exists():
        return {}
    try:
        data = json.loads(CUSTOM_TOOLS_FILE.read_text())
        if isinstance(data, dict):
            return data
        return {}
    except Exception:
        return {}


def _save_custom_tools(data: dict[str, dict]) -> None:
    CUSTOM_TOOLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    CUSTOM_TOOLS_FILE.write_text(json.dumps(data, indent=2))


def list_custom_tools() -> list[dict]:
    tools = _load_custom_tools()
    return [tools[name] for name in sorted(tools.keys())]


def upsert_custom_tool(defn: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    raw_name = (defn.get("name") or "").strip()
    name = _norm(raw_name)
    if len(name) < 2:
        raise ValueError("Tool name must be at least 2 characters.")
    if name in TOOLS:
        raise ValueError(f"'{name}' conflicts with a built-in tool name.")

    kind = (defn.get("kind") or "").strip().lower()
    if kind not in {"http", "script"}:
        raise ValueError("kind must be 'http' or 'script'.")

    timeout = int(defn.get("timeout") or 20)
    timeout = max(1, min(timeout, 180))

    record = {
        "name": name,
        "kind": kind,
        "description": (defn.get("description") or "").strip(),
        "timeout": timeout,
        "updated_at": now,
    }

    if kind == "http":
        url = (defn.get("url") or "").strip()
        if not url:
            raise ValueError("HTTP tool requires a non-empty 'url'.")
        method = (defn.get("method") or "GET").strip().upper()
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
            raise ValueError("HTTP tool method must be one of GET/POST/PUT/PATCH/DELETE.")
        record.update({
            "method": method,
            "url": url,
            "headers": defn.get("headers") or {},
            "body": defn.get("body"),
        })

    if kind == "script":
        command = (defn.get("command") or "").strip()
        if not command:
            raise ValueError("Script tool requires a non-empty 'command'.")
        language = (defn.get("language") or "bash").strip().lower()
        if language not in {"bash", "python"}:
            raise ValueError("Script tool language must be 'bash' or 'python'.")
        record.update({
            "command": command,
            "language": language,
            "workingDir": defn.get("workingDir"),
        })

    tools = _load_custom_tools()
    if name in tools and tools[name].get("created_at"):
        record["created_at"] = tools[name]["created_at"]
    else:
        record["created_at"] = now
    tools[name] = record
    _save_custom_tools(tools)
    return record


def delete_custom_tool(name: str) -> bool:
    normalized = _norm(name)
    tools = _load_custom_tools()
    if normalized not in tools:
        return False
    del tools[normalized]
    _save_custom_tools(tools)
    return True


async def _run_custom_tool(tool: dict, params: dict) -> str:
    kind = tool.get("kind")
    timeout = int(tool.get("timeout") or 20)
    timeout = max(1, min(timeout, 180))

    if kind == "http":
        method = (tool.get("method") or "GET").upper()
        url = _render_value(tool.get("url") or "", params)
        headers = _render_value(tool.get("headers") or {}, params)
        body_template = tool.get("body")
        body = _render_value(body_template, params) if body_template is not None else params.get("body")
        if not url:
            return "Custom HTTP tool misconfigured: missing URL."
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                if method in {"POST", "PUT", "PATCH", "DELETE"}:
                    resp = await client.request(method, url, headers=headers, json=body)
                else:
                    resp = await client.request(method, url, headers=headers, params=params)
                return f"[HTTP {resp.status_code}] {resp.text[:3000]}"
        except Exception as exc:
            return f"[Custom HTTP tool error] {exc}"

    if kind == "script":
        command = _render_value(tool.get("command") or "", params)
        language = (tool.get("language") or "bash").lower()
        working_dir = _render_value(tool.get("workingDir") or "", params) or None
        if not command:
            return "Custom script tool misconfigured: missing command."
        try:
            return await shell_svc.run_shell(
                command=command,
                working_dir=working_dir,
                timeout=timeout,
                language=language,
            )
        except Exception as exc:
            return f"[Custom script tool error] {exc}"

    return f"Custom tool '{tool.get('name')}' has unsupported kind '{kind}'."

# Aliases/synonyms used by planner prompts or user configs.
# Keep keys normalized via _norm().
_ALIASES: dict[str, str] = {
    "search": "web_search",
    "duckduckgo": "web_search",
    "websearch": "web_search",
    "browser_search": "web_search",
    "http": "http_request",
    "api": "http_request",
    "rest": "http_request",
    "python": "code_runner",
    "python_runner": "code_runner",
    "file": "file_reader",
    "read_file": "file_reader",
    "json": "json_parse",
    "parse_json": "json_parse",
    "csv": "csv_reader",
    "split_text": "text_splitter",
    "math": "calculator",
    "calc": "calculator",
    "date_time": "datetime_helper",
    "datetime": "datetime_helper",
    "time": "datetime_helper",
    "summarizer": "summarize",
}


def _norm(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")


def _resolve_by_hint(hint: str | None) -> str | None:
    h = (hint or "").lower()
    if not h:
        return None
    if any(k in h for k in ("search", "web", "lookup", "find", "research")):
        return "web_search"
    if any(k in h for k in ("http", "api", "request", "endpoint", "post", "get")):
        return "http_request"
    if any(k in h for k in ("python", "code", "script", "run code", "execute code")):
        return "code_runner"
    if any(k in h for k in ("file", "document", "read file", "open file")):
        return "file_reader"
    if any(k in h for k in ("json", "payload", "schema")):
        return "json_parse"
    if any(k in h for k in ("csv", "spreadsheet", "tabular")):
        return "csv_reader"
    if any(k in h for k in ("split", "chunk", "tokenize")):
        return "text_splitter"
    if any(k in h for k in ("calculate", "math", "equation")):
        return "calculator"
    if any(k in h for k in ("date", "time", "timezone", "utc")):
        return "datetime_helper"
    if any(k in h for k in ("summarize", "summary", "compress text")):
        return "summarize"
    return None


def resolve_tool_name(requested: str | None, hint: str | None = None) -> tuple[str | None, str | None]:
    """
    Resolve a requested tool name to an available built-in tool.
    Returns: (resolved_tool_name_or_none, note_or_none)
    """
    raw = (requested or "").strip()
    custom_tools = _load_custom_tools()
    if raw in TOOLS:
        return raw, None
    if raw in custom_tools:
        return raw, None

    normalized = _norm(raw)
    if normalized in TOOLS:
        resolved = normalized
        return resolved, f"Resolved tool '{raw}'  '{resolved}'."
    if normalized in custom_tools:
        return normalized, f"Resolved custom tool '{raw}'  '{normalized}'."

    alias_hit = _ALIASES.get(normalized)
    if alias_hit and alias_hit in TOOLS:
        return alias_hit, f"Mapped tool alias '{raw}'  '{alias_hit}'."

    if raw:
        choices = list(TOOLS.keys()) + list(_ALIASES.keys()) + list(custom_tools.keys())
        close = difflib.get_close_matches(normalized, choices, n=1, cutoff=0.78)
        if close:
            guessed = close[0]
            resolved = _ALIASES.get(guessed, guessed)
            if resolved in TOOLS or resolved in custom_tools:
                return resolved, f"Tool '{raw}' not found. Using closest match '{resolved}'."

    hinted = _resolve_by_hint(f"{raw} {hint or ''}")
    if hinted and hinted in TOOLS:
        note = f"Tool '{raw or 'unspecified'}' unavailable. Routed by intent to '{hinted}'."
        return hinted, note

    if not raw:
        return None, "No tool specified."
    return None, f"Unknown tool '{raw}'. Available tools: {', '.join(list_tools())}."


def list_tools() -> list[str]:
    custom = sorted(_load_custom_tools().keys())
    return list(TOOLS.keys()) + custom


def get_tool_catalog() -> list[dict]:
    catalog = []
    builtins = set(TOOLS.keys())
    custom_tools = _load_custom_tools()
    for name in list_tools():
        meta = _TOOL_CAPABILITIES.get(name, {})
        if name in custom_tools:
            custom = custom_tools[name]
            meta = {
                "category": f"custom_{custom.get('kind', 'tool')}",
                "purpose": custom.get("description") or f"Custom {custom.get('kind', 'tool')} adapter",
            }
        catalog.append({
            "name": name,
            "category": meta.get("category", "general"),
            "purpose": meta.get("purpose", ""),
            "is_custom": name not in builtins,
        })
    return catalog


async def run_tool(tool_name: str, params: dict) -> str:
    """Execute a tool by name. Returns its string result."""
    resolved, note = resolve_tool_name(tool_name)
    if not resolved:
        return note or f"Unknown tool: '{tool_name}'. Available: {list_tools()}"
    custom_tools = _load_custom_tools()
    fn = TOOLS.get(resolved)

    try:
        if fn:
            result = await fn(params)
        elif resolved in custom_tools:
            result = await _run_custom_tool(custom_tools[resolved], params or {})
        else:
            return f"Unknown tool: '{tool_name}'. Available: {list_tools()}"
        if note:
            return f"{note}\n\n{result}"
        return result
    except Exception as e:
        return f"[Tool error: {resolved}] {e}"
