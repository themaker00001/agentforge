from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Node / Edge ──────────────────────────────────────────────────────────────

class NodeType(str, Enum):
    input       = "input"
    agent       = "agent"
    tool        = "tool"
    knowledge   = "knowledge"
    output      = "output"
    shell_exec  = "shell_exec"   # Run shell commands / scripts locally
    file_system = "file_system"  # Read, write, list, search local files
    powerbi     = "powerbi"      # Power BI automation


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
    # Shell executor fields
    command:      Optional[str] = None   # shell command or script body
    workingDir:   Optional[str] = None   # working directory (relative to sandbox)
    timeout:      Optional[int] = 30     # execution timeout in seconds
    language:     Optional[str] = "bash" # "bash" | "python"
    # File system fields
    fsOperation:  Optional[str] = None   # "read" | "write" | "list" | "search"
    fsPath:       Optional[str] = None   # target path (relative to sandbox)
    fsContent:    Optional[str] = None   # content for write operations
    fsPattern:    Optional[str] = None   # glob/regex for search/list
    # Power BI fields
    pbiWorkspaceId: Optional[str] = None
    pbiDatasetId:   Optional[str] = None
    pbiAction:      Optional[str] = None   # "dax_query" | "refresh"
    pbiQuery:       Optional[str] = None   # DAX query string


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
    ollama:   list[str]
    openai:   list[str]
    gemini:   list[str]
    lmstudio: list[str] = []


# ── Background task models ────────────────────────────────────────────────────

class TaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    done    = "done"
    error   = "error"


class BackgroundTask(BaseModel):
    task_id:    str
    status:     TaskStatus = TaskStatus.pending
    result:     Optional[str] = None
    created_at: str
    flow:       FlowGraph
    user_input: str


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
