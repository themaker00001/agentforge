"""
Planner Service — converts a user prompt into a FlowGraph.

Strategy:
1. Ask Ollama (or fallback LLM) to generate valid JSON for a flow graph.
2. Validate and parse the JSON into a FlowGraph.
3. If LLM output is invalid, fall back to a keyword-matched hardcoded template.
"""

import json
import re
import uuid
from app.llm.registry import get_llm
from app.models.schema import FlowGraph, Node, NodeData, NodePosition, Edge, NodeType


SYSTEM_PROMPT = """You are an AI workflow architect. Given a user prompt, 
produce a minimal JSON workflow graph with "nodes" and "edges" arrays.

Rules:
- Every flow must start with exactly one "input" node and end with one "output" node.
- Use node types: "input", "agent", "tool", "knowledge", "output"
- Each node has: id (string), nodeType (string), label (string), x (number), y (number)
- Each edge has: source (node id), target (node id)
- Keep it minimal: 3–6 nodes maximum.
- Return ONLY valid JSON, no markdown, no explanation.

Example output:
{
  "nodes": [
    {"id":"n1","nodeType":"input","label":"User Query","x":80,"y":150},
    {"id":"n2","nodeType":"agent","label":"AI Agent","x":320,"y":150},
    {"id":"n3","nodeType":"output","label":"Answer","x":560,"y":150}
  ],
  "edges": [
    {"source":"n1","target":"n2"},
    {"source":"n2","target":"n3"}
  ]
}"""


def _template_flow(prompt: str) -> FlowGraph:
    """Keyword-matched fallback templates."""
    lower = prompt.lower()
    if any(w in lower for w in ["search", "research", "web", "find"]):
        template = "research"
    elif any(w in lower for w in ["chat", "customer", "support", "qa"]):
        template = "chat"
    elif any(w in lower for w in ["code", "script", "program", "debug"]):
        template = "code"
    elif any(w in lower for w in ["data", "csv", "analys", "report"]):
        template = "data"
    else:
        template = "generic"

    templates = {
        "research": [
            ("n1","input",  "User Query",   80,  150),
            ("n2","agent",  "AI Agent",     310, 80),
            ("n3","tool",   "Web Search",   310, 240),
            ("n4","agent",  "Summarizer",   550, 150),
            ("n5","output", "Answer",       780, 150),
        ],
        "chat": [
            ("n1","input",     "User Message", 80,  150),
            ("n2","knowledge", "Memory",       310, 80),
            ("n3","agent",     "Chat Agent",   310, 230),
            ("n4","output",    "Response",     560, 150),
        ],
        "code": [
            ("n1","input",  "Task Input",  80,  150),
            ("n2","agent",  "Code Agent",  310, 80),
            ("n3","tool",   "Code Runner", 310, 240),
            ("n4","agent",  "Reviewer",    550, 150),
            ("n5","output", "Output",      780, 150),
        ],
        "data": [
            ("n1","input",     "Data Source", 80,  150),
            ("n2","knowledge", "Vector DB",   310, 80),
            ("n3","agent",     "Analyst",     310, 230),
            ("n4","tool",      "Code Runner", 550, 150),
            ("n5","output",    "Report",      780, 150),
        ],
        "generic": [
            ("n1","input",  "Input",   80,  150),
            ("n2","agent",  "Agent",   320, 150),
            ("n3","output", "Output",  560, 150),
        ],
    }

    raw_nodes = templates[template]
    ICONS = {"input":"💬","agent":"🤖","tool":"🔍","knowledge":"📚","output":"📤"}

    nodes = [
        Node(
            id=nid, type="agentNode",
            position=NodePosition(x=x, y=y),
            data=NodeData(nodeType=NodeType(nt), label=lbl, icon=ICONS.get(nt,"⚙️")),
        )
        for nid, nt, lbl, x, y in raw_nodes
    ]

    # Build edges
    ids = [n for n,*_ in raw_nodes]
    if template == "research":
        edges = [
            Edge(id="e12", source="n1", target="n2"),
            Edge(id="e13", source="n1", target="n3"),
            Edge(id="e24", source="n2", target="n4"),
            Edge(id="e34", source="n3", target="n4"),
            Edge(id="e45", source="n4", target="n5"),
        ]
    else:
        edges = [
            Edge(id=f"e{i}{i+1}", source=ids[i], target=ids[i+1])
            for i in range(len(ids)-1)
        ]

    return FlowGraph(nodes=nodes, edges=edges)


def _parse_llm_graph(raw_json: str) -> FlowGraph:
    """Parse LLM output into a FlowGraph or raise ValueError."""
    # Strip markdown fences if present
    raw_json = re.sub(r"```[a-z]*", "", raw_json).strip().strip("`")
    data = json.loads(raw_json)

    ICONS = {"input":"💬","agent":"🤖","tool":"🔍","knowledge":"📚","output":"📤"}

    nodes = [
        Node(
            id=n["id"], type="agentNode",
            position=NodePosition(x=n.get("x", 100), y=n.get("y", 150)),
            data=NodeData(
                nodeType=NodeType(n.get("nodeType", "agent")),
                label=n.get("label", "Node"),
                icon=ICONS.get(n.get("nodeType", "agent"), "⚙️"),
            ),
        )
        for n in data["nodes"]
    ]
    edges = [
        Edge(id=f"e_{e['source']}_{e['target']}", source=e["source"], target=e["target"])
        for e in data["edges"]
    ]
    return FlowGraph(nodes=nodes, edges=edges)


async def generate_flow(prompt: str, model: str = "ollama:llama3") -> FlowGraph:
    """Main entry point: prompt → FlowGraph."""
    try:
        llm = get_llm(model)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": f"Create a flow for: {prompt}"},
        ]
        raw = await llm.chat(messages, temperature=0.3, max_tokens=1024)
        return _parse_llm_graph(raw)
    except Exception:
        # Fall back to template if LLM fails or isn't running
        return _template_flow(prompt)
