from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Node / Edge ──────────────────────────────────────────────────────────────

class NodeType(str, Enum):
    input     = "input"
    agent     = "agent"
    tool      = "tool"
    knowledge = "knowledge"
    output    = "output"


class NodeData(BaseModel):
    nodeType:     NodeType   = NodeType.agent
    label:        str        = "Node"
    icon:         str        = "🤖"
    model:        str        = "ollama:llama3:8b"
    systemPrompt: str        = ""
    temperature:  float      = Field(default=0.7, ge=0.0, le=1.0)
    maxTokens:    int        = Field(default=2048, ge=64, le=32000)
    memory:       bool       = True
    toolsEnabled: bool       = True
    streaming:    bool       = False
    toolName:     Optional[str] = None   # for tool nodes
    params:       Optional[dict[str, Any]] = None


class NodePosition(BaseModel):
    x: float = 0.0
    y: float = 0.0


class Node(BaseModel):
    id:       str
    type:     str = "agentNode"
    position: NodePosition
    data:     NodeData


class Edge(BaseModel):
    id:     str
    source: str
    target: str


class FlowGraph(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


# ── Request / Response bodies ─────────────────────────────────────────────────

class GenerateFlowRequest(BaseModel):
    prompt: str
    model:  str = "ollama:llama3"


class ExecuteRequest(BaseModel):
    flow:      FlowGraph
    userInput: str  = ""
    model:     str  = "ollama:llama3:8b"
    sessionId: str  = "default"


class ModelsResponse(BaseModel):
    ollama: list[str]
    openai: list[str]
    gemini: list[str]


class KnowledgeUploadRequest(BaseModel):
    text:  Optional[str] = None
    title: Optional[str] = "Untitled"


class ToolExecuteRequest(BaseModel):
    tool:   str
    params: dict[str, Any] = {}


# ── Log events (SSE payloads) ─────────────────────────────────────────────────

class LogType(str, Enum):
    info  = "info"
    ok    = "ok"
    warn  = "warn"
    err   = "err"
    run   = "run"
    exec  = "exec"
    chunk = "chunk"   # streaming LLM output chunk
    done  = "done"


class LogEvent(BaseModel):
    type:      LogType
    nodeId:    Optional[str] = None
    message:   str
    timestamp: Optional[str] = None
    data:      Optional[Any] = None
