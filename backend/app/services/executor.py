"""
Execution Engine
- Topological sort (Kahn's algorithm) on the flow graph
- Executes nodes in order, passing outputs between them
- Yields LogEvent dicts for SSE streaming
"""

from __future__ import annotations
import asyncio
from collections import defaultdict, deque
from datetime import datetime

from app.models.schema import FlowGraph, NodeType, LogEvent, LogType
from app.services import agent as agent_svc
from app.services import tool_manager as tool_svc
from app.services import knowledge as know_svc
from app.llm.registry import get_llm


def _log(type: LogType, message: str, node_id: str | None = None, data=None) -> dict:
    return LogEvent(
        type=type,
        nodeId=node_id,
        message=message,
        timestamp=datetime.utcnow().isoformat(),
        data=data,
    ).model_dump()


def _topological_sort(graph: FlowGraph) -> list[str]:
    """
    Kahn's algorithm — returns node ids in execution order.
    Raises ValueError on cycles.
    """
    in_degree: dict[str, int] = {n.id: 0 for n in graph.nodes}
    adj: dict[str, list[str]] = defaultdict(list)

    for edge in graph.edges:
        adj[edge.source].append(edge.target)
        in_degree[edge.target] += 1

    queue = deque(nid for nid, deg in in_degree.items() if deg == 0)
    order = []

    while queue:
        nid = queue.popleft()
        order.append(nid)
        for neighbor in adj[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(order) != len(graph.nodes):
        raise ValueError("Flow graph contains a cycle — cannot execute.")

    return order


def _first_sentence(text: str, max_chars: int = 200) -> str:
    """Return a compact label for logging."""
    one_line = text.replace("\n", " ").strip()
    return one_line[:max_chars] + ("…" if len(one_line) > max_chars else "")


async def _synthesize_output(
    node,
    user_input: str,
    gathered_context: str,
    model: str,
    session_id: str,
) -> str:
    """
    Call the LLM to synthesize a coherent final answer from all the
    tool/knowledge/agent outputs that were collected before the output node.
    """
    llm = get_llm(model)
    system = (
        node.data.systemPrompt
        or (
            "You are a helpful assistant. "
            "Using the context below, write a clear, concise, and friendly answer "
            "to the user's question. Do NOT echo the context verbatim — summarize "
            "and synthesize it into a natural response."
        )
    )
    messages = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": (
                f"User's question:\n{user_input}\n\n"
                f"Context from previous steps:\n{gathered_context}\n\n"
                "Please provide a helpful, conversational answer."
            ),
        },
    ]
    return await llm.chat(
        messages,
        temperature=node.data.temperature,
        max_tokens=node.data.maxTokens,
    )


async def execute(
    graph: FlowGraph,
    user_input: str = "",
    model: str = "ollama:llama3:8b",
    session_id: str = "default",
):
    """
    Async generator that:
    1. Topologically sorts the graph
    2. Executes each node in order
    3. Yields LogEvent dicts for SSE streaming
    """
    yield _log(LogType.run, f"Starting execution — {len(graph.nodes)} nodes")

    # Validate + sort
    try:
        order = _topological_sort(graph)
    except ValueError as e:
        yield _log(LogType.err, str(e))
        return

    # Node lookup
    node_map = {n.id: n for n in graph.nodes}
    # Edge lookup: for each node, which source nodes feed directly into it?
    feeds: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        feeds[edge.target].append(edge.source)

    node_outputs: dict[str, str] = {}

    for nid in order:
        node = node_map[nid]
        ntype = node.data.nodeType
        label = node.data.label

        yield _log(LogType.exec, f"▶ {label}", node_id=nid)

        # Gather DIRECT predecessor outputs only (not everything)
        direct_inputs = [
            node_outputs[src]
            for src in feeds[nid]
            if src in node_outputs
        ]
        # Primary context: direct inputs joined, fallback to user_input
        context = "\n\n".join(direct_inputs) if direct_inputs else user_input

        try:
            # ── Input node ──────────────────────────────────────────────────
            if ntype == NodeType.input:
                result = user_input or f"[Input: {label}]"

            # ── Agent node ──────────────────────────────────────────────────
            elif ntype == NodeType.agent:
                yield _log(LogType.info, f"  Calling LLM ({node.data.model or model})…", nid)
                result = await agent_svc.run_agent(
                    node=node,
                    user_input=user_input,      # always the original question
                    context=context,            # predecessor outputs as context
                    node_outputs=node_outputs,
                    session_id=session_id,
                    model_override=model if not node.data.model else None,
                )

            # ── Tool node ───────────────────────────────────────────────────
            elif ntype == NodeType.tool:
                tool_name = node.data.toolName or _guess_tool(label)
                params = node.data.params or {}
                if not params:
                    # Use the ORIGINAL user question as the search query,
                    # not the accumulated context from all prior nodes
                    search_query = user_input.strip() or context
                    params = (
                        {"query": search_query}
                        if "search" in tool_name
                        else {"code": context}
                    )
                yield _log(LogType.info, f"  Running tool: {tool_name}", nid)
                result = await tool_svc.run_tool(tool_name, params)

            # ── Knowledge node ──────────────────────────────────────────────
            elif ntype == NodeType.knowledge:
                yield _log(LogType.info, "  Retrieving knowledge context…", nid)
                # Search knowledge base using the original user question
                result = (
                    know_svc.context_for(user_input, top_k=3)
                    or "No relevant knowledge found."
                )

            # ── Output node — synthesize via LLM ───────────────────────────
            elif ntype == NodeType.output:
                yield _log(LogType.info, "  Synthesizing final answer…", nid)
                result = await _synthesize_output(
                    node=node,
                    user_input=user_input,
                    gathered_context=context,
                    model=node.data.model or model,
                    session_id=session_id,
                )

            else:
                result = context

            node_outputs[nid] = result
            preview = _first_sentence(result)
            yield _log(LogType.ok, f"  ✓ {label}: {preview}", nid, data={"output": result})

        except Exception as exc:
            error_msg = f"  ✗ {label} failed: {exc}"
            yield _log(LogType.err, error_msg, nid)
            node_outputs[nid] = f"[error: {exc}]"

        await asyncio.sleep(0)   # yield control to event loop

    # Final output
    output_nodes = [n for n in graph.nodes if n.data.nodeType == NodeType.output]
    final = "\n".join(node_outputs.get(n.id, "") for n in output_nodes)
    yield _log(LogType.run, "Execution complete ✓", data={"final_output": final})


def _guess_tool(label: str) -> str:
    label_lower = label.lower()
    if "search" in label_lower or "web" in label_lower:
        return "web_search"
    if "code" in label_lower or "run" in label_lower or "exec" in label_lower:
        return "code_runner"
    if "http" in label_lower or "api" in label_lower:
        return "http_request"
    if "file" in label_lower or "read" in label_lower:
        return "file_reader"
    return "web_search"
