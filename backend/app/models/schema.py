from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Node / Edge ──────────────────────────────────────────────────────────────

class NodeType(str, Enum):
    input        = "input"
    agent        = "agent"
    tool         = "tool"
    knowledge    = "knowledge"
    output       = "output"
    shell_exec   = "shell_exec"    # Run shell commands / scripts locally
    file_system  = "file_system"   # Read, write, list, search local files
    powerbi      = "powerbi"       # Power BI automation
    condition    = "condition"     # If/else branching
    set_variable = "set_variable"  # Store a named variable
    merge        = "merge"         # Merge multiple upstream outputs
    loop         = "loop"          # Iterate over a list
    webhook      = "webhook"       # External HTTP trigger
    debate       = "debate"        # Multi-agent debate → judge synthesizes consensus
    evaluator    = "evaluator"     # AI quality gate — routes pass/fail by score
    parallel     = "parallel"      # Fan-out: run child branches concurrently
    note         = "note"          # Visual sticky note (no execution)


class NodeData(BaseModel):
    nodeType:     NodeType   = NodeType.agent
    label:        str        = "Node"
    icon:         str        = "🤖"
    model:        str        = "ollama:llama3:8b"
    apiKey:       Optional[str] = None
    systemPrompt: str        = ""
    temperature:  float      = Field(default=0.7, ge=0.0, le=1.0)
    maxTokens:    int        = Field(default=4096, ge=64, le=32000)
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
    # Condition node fields
    conditionExpr: Optional[str] = None   # Python expression, e.g. "len(context) > 10"
    # Set variable fields
    variableName:  Optional[str] = None   # variable name to set
    variableValue: Optional[str] = None   # static value (empty = use upstream context)
    # Merge node fields
    mergeMode:      Optional[str] = "concat"  # "concat" | "array" | "first_non_empty"
    mergeSeparator: Optional[str] = "\n\n"
    # Loop node fields
    loopVar:       Optional[str] = None   # variable name for each item
    # Debate node fields
    debatePersonas:    Optional[list] = None  # [{name, systemPrompt}]
    debateRounds:      int = 1
    debateJudgePrompt: Optional[str] = None
    # Evaluator node fields
    evaluatorRubric:    Optional[str] = None  # rubric text
    evaluatorThreshold: float = 7.0           # min score to "pass"
    # Note / sticky-note fields
    noteContent: Optional[str] = None
    noteColor:   Optional[str] = "#fef3c7"


class NodePosition(BaseModel):
    x: float = 0.0
    y: float = 0.0


class Node(BaseModel):
    id:       str
    type:     str = "agentNode"
    position: NodePosition
    data:     NodeData


class Edge(BaseModel):
    id:           str
    source:       str
    target:       str
    sourceHandle: Optional[str] = None   # "true" | "false" for condition nodes


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


# ── Webhook models ────────────────────────────────────────────────────────────

class WebhookRegisterRequest(BaseModel):
    flow:      FlowGraph
    model:     str = "ollama:llama3:8b"
    sessionId: str = "default"


class WebhookTriggerResponse(BaseModel):
    output:    str
    task_id:   Optional[str] = None


# ── Deploy APIs ───────────────────────────────────────────────────────────────

class DeployRequest(BaseModel):
    slug: str
    flow: FlowGraph
    model: str = "ollama:llama3:8b"
    api_key: Optional[str] = None


class DeployedAPI(BaseModel):
    slug: str
    model: str
    has_api_key: bool
    endpoint_url: str
    created_at: str


class DeployInvokeRequest(BaseModel):
    input: str = ""

