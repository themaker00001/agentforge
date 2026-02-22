"""
Tool Manager — built-in tools registry and execution.
Each tool is a simple async function: (params: dict) → str
"""

import asyncio
import httpx
import subprocess
import json
import os
import re
from pathlib import Path
from urllib.parse import quote_plus

SANDBOX_DIR = Path("/tmp/agentforge")
SANDBOX_DIR.mkdir(exist_ok=True)


# ── Tool implementations ──────────────────────────────────────────────────────

async def _web_search(params: dict) -> str:
    query = params.get("query", "").strip()
    if not query:
        return "No query provided."
    # Sanitize: collapse whitespace/newlines, limit to 200 chars
    query = re.sub(r'\s+', ' ', query)[:200]
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        try:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            # Extract plain text snippets from HTML
            text = resp.text
            snippets = re.findall(r'class="result__snippet"[^>]*>([^<]+)', text)
            titles   = re.findall(r'class="result__a"[^>]*>([^<]+)', text)
            results  = []
            for t, s in zip(titles[:5], snippets[:5]):
                results.append(f"• {t.strip()}: {s.strip()}")
            return "\n".join(results) if results else "No results found."
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
    # Write to sandbox
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


# ── Registry ─────────────────────────────────────────────────────────────────

TOOLS: dict[str, callable] = {
    "web_search":   _web_search,
    "http_request": _http_request,
    "code_runner":  _code_runner,
    "file_reader":  _file_reader,
    "summarize":    _summarize,
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
