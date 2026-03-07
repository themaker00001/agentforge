"""
Execution Engine
- Topological sort (Kahn's algorithm) on the flow graph
- Executes nodes in order, passing outputs between them
- Yields LogEvent dicts for SSE streaming
- Supports condition branching, variable templates, merge, loop, parallel,
  debate, evaluator, sticky notes, and streaming
"""

from __future__ import annotations
import asyncio
import json
import re
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime

from app.models.schema import FlowGraph, NodeType, LogEvent, LogType
from app.services import agent as agent_svc
from app.services import tool_manager as tool_svc
from app.services import knowledge as know_svc
from app.services import shell_executor as shell_svc
from app.services import file_agent as fs_svc
from app.services import powerbi_agent as pbi_svc
from app.services import cost_tracker as ct
from app.services import run_store
from app.services import media_processor
from app.llm.registry import get_llm

# Node types that incur LLM cost
_LLM_NODE_TYPES = {NodeType.agent, NodeType.output, NodeType.debate, NodeType.evaluator}

# Sentinel used to mark a node whose branch was not taken
_SKIPPED = "__SKIPPED__"


def _log(type: LogType, message: str, node_id: str | None = None, data=None) -> dict:
    return LogEvent(
        type=type,
        nodeId=node_id,
        message=message,
        timestamp=datetime.utcnow().isoformat(),
        data=data,
    ).model_dump()


def _topological_sort(graph: FlowGraph) -> list[str]:
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
        raise ValueError("Flow graph contains a cycle  cannot execute.")
    return order


def _first_sentence(text: str, max_chars: int = 600) -> str:
    # Take first non-empty line (preserves readability for multi-line responses)
    first_line = next((l.strip() for l in text.split("\n") if l.strip()), text.strip())
    return first_line[:max_chars] + ("" if len(first_line) > max_chars else "")


def _resolve_templates(text: str, variables: dict[str, str]) -> str:
    if not text or not variables:
        return text
    def replacer(match):
        name = match.group(1).strip()
        return variables.get(name, match.group(0))
    return re.sub(r"\{\{([^}]+)\}\}", replacer, text)


def _resolve_param_value(value, variables: dict[str, str]):
    if isinstance(value, str):
        return _resolve_templates(value, variables)
    if isinstance(value, dict):
        return {k: _resolve_param_value(v, variables) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve_param_value(v, variables) for v in value]
    return value


def _safe_eval(expr: str, context: str, variables: dict) -> bool:
    safe_globals = {
        "__builtins__": {},
        "len": len, "str": str, "int": int, "float": float, "bool": bool,
        "context": context, "variables": variables,
    }
    safe_globals.update(variables)
    try:
        return bool(eval(expr, safe_globals))  # noqa: S307
    except Exception:
        return True


def _mark_branch_skipped(start_id: str, node_map: dict, graph: FlowGraph,
                          skipped_nodes: set, node_outputs: dict):
    skipped_nodes.add(start_id)
    node_outputs[start_id] = _SKIPPED


def _parse_list(text: str) -> list:
    text = text.strip()
    if text.startswith("["):
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return data
        except Exception:
            pass
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    return lines if lines else [text]


def _format_input_payload(mode: str, raw: str) -> str:
    txt = (raw or "").strip()
    if not txt:
        return ""
    m = (mode or "text").strip().lower()

    if m == "json":
        try:
            return json.dumps(json.loads(txt), ensure_ascii=False, indent=2)
        except Exception:
            return txt

    if m == "key_value":
        data = {}
        for line in txt.splitlines():
            line = line.strip()
            if not line:
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                data[k.strip()] = v.strip()
        if data:
            return json.dumps(data, ensure_ascii=False, indent=2)
        return txt

    return txt


def _guess_tool(label: str) -> str:
    label_lower = label.lower()
    if "search" in label_lower or "web" in label_lower:   return "web_search"
    if "code" in label_lower or "exec" in label_lower:    return "code_runner"
    if "http" in label_lower or "api"  in label_lower:    return "http_request"
    if "file" in label_lower or "read" in label_lower:    return "file_reader"
    if "calc" in label_lower or "math" in label_lower:    return "calculator"
    if "json" in label_lower:                             return "json_parse"
    return "web_search"


async def _synthesize_output(node, user_input: str, gathered_context: str,
                              model: str, session_id: str, variables: dict) -> str:
    llm = get_llm(model, api_key=node.data.apiKey)
    raw_system = node.data.systemPrompt or (
        "You are a helpful assistant. "
        "Using the context below, write a clear, concise, and friendly answer "
        "to the user's question. Do NOT echo the context verbatim  summarize "
        "and synthesize it into a natural response."
    )
    system = _resolve_templates(raw_system, variables)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": (
            f"User's question:\n{user_input}\n\n"
            f"Context from previous steps:\n{gathered_context}\n\n"
            "Please provide a helpful, conversational answer."
        )},
    ]
    # Use the node's configured limit but never less than 4096 for synthesis,
    # so the context + user prompt don't eat into the available output budget.
    token_budget = max(node.data.maxTokens, 4096)
    return await llm.chat(messages, temperature=node.data.temperature, max_tokens=token_budget)


async def execute(
    graph: FlowGraph,
    user_input: str = "",
    model: str = "ollama:llama3:8b",
    session_id: str = "default",
):
    #  Run tracking 
    run_id       = str(uuid.uuid4())
    run_start_ms = int(time.time() * 1000)
    all_events:  list[dict] = []
    total_cost:  float      = 0.0

    def _emit(d: dict) -> dict:
        """Append event to run log and return it for yielding."""
        all_events.append(d)
        return d

    yield _emit(_log(LogType.run, f"Starting execution  {len(graph.nodes)} nodes"))

    try:
        order = _topological_sort(graph)
    except ValueError as e:
        yield _emit(_log(LogType.err, str(e)))
        return

    node_map = {n.id: n for n in graph.nodes}

    feeds: dict[str, list[str]] = defaultdict(list)
    edge_handles: dict[tuple[str, str], str] = {}
    for edge in graph.edges:
        feeds[edge.target].append(edge.source)
        if edge.sourceHandle:
            edge_handles[(edge.source, edge.target)] = edge.sourceHandle

    node_outputs:   dict[str, str] = {}
    skipped_nodes:  set[str]       = set()
    executed_nodes: set[str]       = set()   # nodes run inline (parallel)
    variables:      dict[str, str] = {}

    for nid in order:
        # Already executed inline by a parent parallel node
        if nid in executed_nodes:
            continue

        node = node_map[nid]
        ntype = node.data.nodeType
        label = node.data.label

        #  Skip propagation 
        direct_sources = feeds[nid]
        if direct_sources:
            all_skipped = all(
                node_outputs.get(src, "") == _SKIPPED for src in direct_sources
            )
            if all_skipped:
                skipped_nodes.add(nid)
                node_outputs[nid] = _SKIPPED
                yield _emit(_log(LogType.info, f"   {label} skipped (inactive branch)", nid))
                continue

        yield _emit(_log(LogType.exec, f" {label}", node_id=nid))

        direct_inputs = [
            node_outputs[src]
            for src in direct_sources
            if src in node_outputs and node_outputs[src] != _SKIPPED
        ]
        context = "\n\n".join(direct_inputs) if direct_inputs else user_input
        resolved_system = _resolve_templates(node.data.systemPrompt or "", variables)

        result = context   # safe default
        node_start_ms = int(time.time() * 1000)

        try:
            #  Input 
            if ntype == NodeType.input:
                if (user_input or "").strip():
                    result = user_input
                else:
                    fallback = _format_input_payload(
                        node.data.inputMode or "text",
                        node.data.inputDefault or "",
                    )
                    result = fallback or f"[Input: {label}]"

            #  Webhook (input trigger) 
            elif ntype == NodeType.webhook:
                result = user_input or f"[Webhook: {label}]"

            #  Sticky Note  visual only, no-op 
            elif ntype == NodeType.note:
                result = context  # pass-through, doesn't affect flow

            #  Set Variable 
            elif ntype == NodeType.set_variable:
                var_name = node.data.variableName or "var"
                raw_val  = node.data.variableValue
                var_val  = _resolve_templates(raw_val, variables) if raw_val else context
                variables[var_name] = var_val
                yield _emit(_log(LogType.info, f"  Set ${var_name} = {var_val[:80]}", nid))
                result = context

            #  Condition / If-Else 
            elif ntype == NodeType.condition:
                expr = _resolve_templates(node.data.conditionExpr or "True", variables)
                branch = _safe_eval(expr, context, variables)
                branch_label = "true" if branch else "false"
                yield _emit(_log(LogType.info, f"  Condition '{expr}'  {branch_label}", nid))
                for edge in graph.edges:
                    if edge.source != nid:
                        continue
                    handle = edge.sourceHandle or "true"
                    if handle != branch_label:
                        _mark_branch_skipped(edge.target, node_map, graph, skipped_nodes, node_outputs)
                result = context

            #  Evaluator / Grader 
            elif ntype == NodeType.evaluator:
                rubric    = _resolve_templates(
                    node.data.evaluatorRubric or "Rate the quality, accuracy, and helpfulness of this text.",
                    variables
                )
                threshold = node.data.evaluatorThreshold or 7.0
                eff_model = node.data.model or model
                llm = get_llm(eff_model, api_key=node.data.apiKey)
                eval_msgs = [
                    {"role": "system", "content": (
                        f"You are a strict quality evaluator.\n\nRubric: {rubric}\n\n"
                        "Respond with ONLY valid JSON: {\"score\": <float 1-10>, \"reason\": \"<brief reason>\"}"
                    )},
                    {"role": "user", "content": context},
                ]
                yield _emit(_log(LogType.info, f"  Evaluating quality (threshold {threshold}/10)", nid))
                eval_response = await llm.chat(eval_msgs, temperature=0.1, max_tokens=150)

                score = 5.0
                reason = ""
                try:
                    # Strip markdown code fences if present
                    clean = re.sub(r"```[a-z]*\n?", "", eval_response).strip()
                    eval_data = json.loads(clean)
                    score  = float(eval_data.get("score", 5))
                    reason = eval_data.get("reason", "")
                except Exception:
                    m = re.search(r'\b(\d+(?:\.\d+)?)\b', eval_response)
                    if m:
                        score = float(m.group(1))

                passed = score >= threshold
                verdict = "PASS" if passed else "FAIL"
                yield _emit(_log(LogType.info,
                           f"  Score: {score:.1f}/10  {verdict} ({reason[:60]})", nid))

                for edge in graph.edges:
                    if edge.source != nid:
                        continue
                    handle = edge.sourceHandle or "pass"
                    expected = "pass" if passed else "fail"
                    if handle != expected:
                        _mark_branch_skipped(edge.target, node_map, graph, skipped_nodes, node_outputs)

                result = f"[Score: {score:.1f}/10  {verdict}]\n\n{context}"

            #  Multi-Agent Debate 
            elif ntype == NodeType.debate:
                personas = node.data.debatePersonas or [
                    {"name": "Proponent",
                     "systemPrompt": "You argue strongly IN FAVOR of the topic with evidence and reasoning."},
                    {"name": "Critic",
                     "systemPrompt": "You critically challenge the topic, exposing flaws and counterarguments."},
                    {"name": "Pragmatist",
                     "systemPrompt": "You take a balanced, practical view, weighing both sides."},
                ]
                judge_prompt = node.data.debateJudgePrompt or (
                    "You are a neutral synthesis judge. Given the debate perspectives below, "
                    "write a final, balanced, well-reasoned answer that incorporates the strongest points."
                )
                eff_model = node.data.model or model
                yield _emit(_log(LogType.info,
                           f"  Debate: {len(personas)} personas on '{_first_sentence(user_input, 60)}'", nid))

                async def _persona_response(p):
                    llm = get_llm(eff_model, api_key=node.data.apiKey)
                    msgs = [
                        {"role": "system", "content": p["systemPrompt"]},
                        {"role": "user",   "content": f"Topic/Question: {user_input}\n\nContext: {context}"},
                    ]
                    resp = await llm.chat(msgs, temperature=node.data.temperature,
                                         max_tokens=node.data.maxTokens // len(personas))
                    return p["name"], resp

                persona_results = await asyncio.gather(
                    *[_persona_response(p) for p in personas],
                    return_exceptions=True,
                )

                debate_lines = []
                for pr in persona_results:
                    if isinstance(pr, Exception):
                        debate_lines.append(f"[Error: {pr}]")
                    else:
                        name, resp = pr
                        debate_lines.append(f"**{name}**:\n{resp}")
                        yield _emit(_log(LogType.info, f"  {name} responded", nid))

                debate_text = "\n\n---\n\n".join(debate_lines)

                yield _emit(_log(LogType.info, "  Synthesizing debate into final answer", nid))
                judge_llm = get_llm(eff_model, api_key=node.data.apiKey)
                judge_msgs = [
                    {"role": "system", "content": judge_prompt},
                    {"role": "user",   "content": (
                        f"Original question: {user_input}\n\n"
                        f"Debate:\n{debate_text}\n\n"
                        "Provide a final, synthesized answer:"
                    )},
                ]
                result = await judge_llm.chat(judge_msgs, temperature=0.3,
                                              max_tokens=node.data.maxTokens)

            #  Parallel Branch 
            elif ntype == NodeType.parallel:
                child_ids   = [e.target for e in graph.edges if e.source == nid]
                child_nodes = [node_map[cid] for cid in child_ids if cid in node_map]
                yield _emit(_log(LogType.info,
                           f"  Launching {len(child_nodes)} parallel branches", nid))

                async def _run_child_branch(child):
                    ctype = child.data.nodeType
                    if ctype == NodeType.agent:
                        enriched = (
                            f"[Search/Tool Results]:\n{context}\n\nAnswer the user's question."
                            if context and context != user_input and len(context) > 20
                            else context
                        )
                        return await agent_svc.run_agent(
                            node=child,
                            user_input=user_input,
                            context=enriched,
                            node_outputs={},
                            session_id=session_id,
                            model_override=model if not child.data.model else None,
                        )
                    elif ctype == NodeType.tool:
                        requested_tool = child.data.toolName or _guess_tool(child.data.label)
                        tool_name, tool_note = tool_svc.resolve_tool_name(
                            requested_tool,
                            hint=f"{child.data.label} {context[:200]}",
                        )
                        if not tool_name:
                            return tool_note or f"Unknown tool: {requested_tool}"
                        params = {k: _resolve_param_value(v, variables)
                                  for k, v in (child.data.params or {}).items()}
                        if not params:
                            params = {"query": user_input} if "search" in tool_name else {"code": context}
                        output = await tool_svc.run_tool(tool_name, params)
                        if tool_note:
                            return f"[tool-resolver] {tool_note}\n\n{output}"
                        return output
                    elif ctype == NodeType.knowledge:
                        kb = know_svc.context_for(user_input, top_k=3)
                        return kb or context
                    else:
                        return context

                branch_results = await asyncio.gather(
                    *[_run_child_branch(c) for c in child_nodes],
                    return_exceptions=True,
                )

                clean = []
                for child, res in zip(child_nodes, branch_results):
                    if isinstance(res, Exception):
                        out = f"[Branch '{child.data.label}' error: {res}]"
                    else:
                        out = str(res)
                    node_outputs[child.id] = out
                    executed_nodes.add(child.id)
                    clean.append(out)
                    yield _emit(_log(LogType.ok,
                               f"   Branch '{child.data.label}': {_first_sentence(out)}", nid))

                result = json.dumps(clean)

            #  Agent 
            elif ntype == NodeType.agent:
                eff_model = node.data.model or model
                yield _emit(_log(LogType.info, f"  Calling LLM ({eff_model})", nid))
                enriched = (
                    f"[Search/Tool Results]:\n{context}\n\nUse the above results to answer the user's question."
                    if context and context != user_input and len(context) > 20
                    else context
                )
                patched = node.model_copy(deep=True)
                patched.data.systemPrompt = resolved_system

                if node.data.streaming:
                    chunks = []
                    async for chunk in agent_svc.run_agent_stream(
                        node=patched,
                        user_input=user_input,
                        context=_resolve_templates(enriched, variables),
                        node_outputs=node_outputs,
                        session_id=session_id,
                        model_override=model if not node.data.model else None,
                    ):
                        chunks.append(chunk)
                        yield _emit(_log(LogType.chunk, chunk, nid))
                    result = "".join(chunks)
                else:
                    result = await agent_svc.run_agent(
                        node=patched,
                        user_input=user_input,
                        context=_resolve_templates(enriched, variables),
                        node_outputs=node_outputs,
                        session_id=session_id,
                        model_override=model if not node.data.model else None,
                    )

            #  Tool 
            elif ntype == NodeType.tool:
                requested_tool = node.data.toolName or _guess_tool(label)
                tool_name, tool_note = tool_svc.resolve_tool_name(
                    requested_tool,
                    hint=f"{label} {context[:200]}",
                )
                if tool_note:
                    yield _emit(_log(LogType.warn, f"  {tool_note}", nid))
                if not tool_name:
                    raise ValueError(tool_note or f"Unknown tool: {requested_tool}")
                params = {k: _resolve_param_value(v, variables)
                          for k, v in (node.data.params or {}).items()}
                if not params:
                    search_query = user_input.strip() or context
                    params = ({"query": search_query} if "search" in tool_name
                              else {"code": context})
                yield _emit(_log(LogType.info, f"  Running tool: {tool_name}", nid))
                result = await tool_svc.run_tool(tool_name, params)

            #  Knowledge 
            elif ntype == NodeType.knowledge:
                yield _emit(_log(LogType.info, "  Retrieving knowledge context", nid))
                inline = (node.data.knowledgeText or "").strip()
                top_k = int(node.data.knowledgeTopK or 3)
                kb_result = know_svc.context_for(user_input, top_k=top_k)
                if kb_result and inline:
                    result = f"{kb_result}\n\nInline knowledge:\n{inline}"
                elif kb_result:
                    result = kb_result
                elif inline:
                    result = f"Inline knowledge:\n{inline}"
                    yield _emit(_log(LogType.info, "  Using inline knowledge text from node.", nid))
                else:
                    result = context or "No relevant knowledge found."
                    yield _emit(_log(LogType.info, "  No KB docs loaded  passing through upstream context.", nid))

            #  Output 
            elif ntype == NodeType.output:
                if node.data.systemPrompt and node.data.systemPrompt.strip():
                    # User configured a custom synthesis prompt  run LLM
                    yield _emit(_log(LogType.info, "  Synthesizing final answer", nid))
                    result = await _synthesize_output(
                        node=node,
                        user_input=user_input,
                        gathered_context=context,
                        model=node.data.model or model,
                        session_id=session_id,
                        variables=variables,
                    )
                else:
                    # No custom prompt  the upstream agent already produced the answer.
                    # Pass it through directly so nothing gets truncated or re-summarized.
                    result = context
                    yield _emit(_log(LogType.info, "  Output ready", nid))

            #  Merge 
            elif ntype == NodeType.merge:
                mode = node.data.mergeMode or "concat"
                sep  = node.data.mergeSeparator if node.data.mergeSeparator is not None else "\n\n"
                non_empty = [v for v in direct_inputs if v and v != _SKIPPED]
                if mode == "array":
                    result = json.dumps(non_empty)
                elif mode == "first_non_empty":
                    result = non_empty[0] if non_empty else ""
                else:
                    result = sep.join(non_empty)
                yield _emit(_log(LogType.info, f"  Merged {len(non_empty)} inputs ({mode})", nid))

            #  Loop / Iterator 
            elif ntype == NodeType.loop:
                loop_var = node.data.loopVar or "item"
                items = _parse_list(context)
                yield _emit(_log(LogType.info, f"  Looping over {len(items)} items as ${loop_var}", nid))
                child_ids = [e.target for e in graph.edges if e.source == nid]
                child_nodes = [node_map[cid] for cid in child_ids if cid in node_map
                               and node_map[cid].data.nodeType == NodeType.agent]
                loop_results = []
                for item in items:
                    variables[loop_var] = str(item)
                    for child in child_nodes:
                        cr = await agent_svc.run_agent(
                            node=child, user_input=str(item), context=str(item),
                            node_outputs=node_outputs, session_id=session_id,
                            model_override=model if not child.data.model else None,
                        )
                        loop_results.append(cr)
                result = json.dumps(loop_results) if loop_results else context

            #  Shell Executor 
            elif ntype == NodeType.shell_exec:
                lang = node.data.language or "bash"
                yield _emit(_log(LogType.run, f"  Running {lang} command", nid))
                cmd = node.data.command or context
                output = await shell_svc.run_shell(
                    command=cmd, working_dir=node.data.workingDir,
                    timeout=node.data.timeout or 30, language=lang,
                )
                result = output
                yield _emit(_log(LogType.ok, f"  Shell output: {output[:200]}", nid))

            #  File System 
            elif ntype == NodeType.file_system:
                op = node.data.fsOperation or "read"
                yield _emit(_log(LogType.run, f"  File operation: {op}", nid))
                output = await fs_svc.run_fs_operation(
                    operation=op, path=node.data.fsPath,
                    content=node.data.fsContent or context, pattern=node.data.fsPattern,
                )
                result = output
                yield _emit(_log(LogType.ok, f"  FS result: {output[:200]}", nid))

            #  Power BI 
            elif ntype == NodeType.powerbi:
                yield _emit(_log(LogType.run, "  Starting Power BI interaction", nid))
                async for pbi_event in pbi_svc.run_powerbi_node(node, context):
                    if pbi_event["type"] == "result":
                        result = pbi_event["message"]
                    elif pbi_event["type"] == "auth_required":
                        yield _emit(_log(LogType.info, pbi_event["message"], nid, data=pbi_event["data"]))
                    else:
                        yield _emit(_log(pbi_event["type"], pbi_event["message"], nid))

            #  Media Input 
            elif ntype == NodeType.media_input:
                media_type = node.data.mediaType or "image"
                file_id    = node.data.mediaFileId
                api_key    = node.data.apiKey
                yield _emit(_log(LogType.info, f"  Processing {media_type} media", nid))
                if file_id:
                    processed = await media_processor.process_media(
                        file_id=file_id,
                        media_type=media_type,
                        model=node.data.model or model,
                        api_key=api_key,
                    )
                    # For images: store full data URL but show only a short preview
                    if media_type == "image" and processed.startswith("data:"):
                        result = processed
                        preview_msg = f"[Image data URL, {len(processed)} chars]"
                    else:
                        result = processed
                        preview_msg = processed[:120]
                    yield _emit(_log(LogType.ok, f"  Media ready: {preview_msg}", nid))
                elif node.data.mediaUrl:
                    result = node.data.mediaUrl
                    yield _emit(_log(LogType.info, f"  Using media URL: {node.data.mediaUrl[:80]}", nid))
                else:
                    result = "[No media file or URL configured]"
                    yield _emit(_log(LogType.warn, result, nid))

            #  Fallback 
            else:
                result = context

            #  Per-node metrics 
            latency_ms = int(time.time() * 1000) - node_start_ms
            eff_model  = node.data.model or model
            if ntype in _LLM_NODE_TYPES:
                tokens_in  = ct.estimate_tokens(context)
                tokens_out = ct.estimate_tokens(result)
                cost_usd   = ct.calc_cost(eff_model, tokens_in, tokens_out)
            else:
                tokens_in = tokens_out = 0
                cost_usd  = 0.0
            total_cost += cost_usd

            metrics = {
                "latency_ms": latency_ms,
                "tokens_in":  tokens_in,
                "tokens_out": tokens_out,
                "cost_usd":   cost_usd,
            }

            node_outputs[nid] = result
            # For images don't log the full data URL
            log_preview = (
                f"[Image {len(result)} chars]"
                if result.startswith("data:image/")
                else _first_sentence(result)
            )
            ok_event = _log(LogType.ok, f"   {label}: {log_preview}", nid,
                            data={"output": result, "metrics": metrics})
            yield _emit(ok_event)

        except Exception as exc:
            yield _emit(_log(LogType.err, f"   {label} failed: {exc}", nid))
            node_outputs[nid] = f"[error: {exc}]"

        await asyncio.sleep(0)

    output_nodes = [n for n in graph.nodes if n.data.nodeType == NodeType.output]
    final = "\n".join(node_outputs.get(n.id, "") for n in output_nodes)
    done_event = _log(LogType.run, "Execution complete ", data={"final_output": final})
    yield _emit(done_event)

    #  Persist run record 
    duration_ms = int(time.time() * 1000) - run_start_ms
    try:
        import json as _json
        run_store.save_run(
            run_id=run_id,
            user_input=user_input,
            model=model,
            flow_json=_json.dumps(graph.model_dump()),
            events=all_events,
            total_cost_usd=round(total_cost, 8),
            duration_ms=duration_ms,
            node_count=len(graph.nodes),
        )
    except Exception:
        pass  # Never let run-save crash the execution stream
