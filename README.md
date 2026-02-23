<div align="center">

# AgentForge

### **Build AI Agent Workflows — Locally, Visually, Freely**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.13-blue?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20LLM-black)](https://ollama.com/)

> **Run your own AI agents. No cloud. No subscriptions. No data leaving your machine.**

[Features](#features) • [Architecture](#architecture) • [Quickstart](#quickstart) • [Vs. n8n & Others](#why-agentforge) • [Roadmap](#roadmap)

</div>

---

## What is AgentForge?

**AgentForge** is a **local-first, open-source AI agent workflow builder**. Design multi-step AI pipelines using a visual drag-and-drop canvas, powered entirely by models running on your own hardware — no API keys required.

Think of it as the intersection of n8n's visual workflows + LangChain's agent power + 100% local privacy.

---

## Features

### Visual Workflow Builder
- Drag-and-drop canvas — build complex AI pipelines without code
- Connect **Input → Agent → Tool → Knowledge → Output** nodes in any order
- Real-time execution graph with topological sorting (Kahn's algorithm) for cycle detection
- Live **Debug Console** — stream execution logs and node outputs step-by-step via SSE

### Multi-Provider LLM Support
| Provider | Status | Notes |
|----------|--------|-------|
| **Ollama** | ✅ Ready | Fully local — `llama3`, `mistral`, `phi3`, and more |
| **LM Studio** | ✅ Ready | OpenAI-compatible API at `localhost:1234` |
| **OpenAI** | ✅ Ready | GPT-4o, GPT-3.5-turbo |
| **Google Gemini** | ✅ Ready | Gemini 1.5 Flash, Pro |

Switch models **per-node** — use a fast local model for search and a powerful cloud model just for final synthesis.

### Built-in Agent Tools
| Tool | What it does |
|------|-------------|
| `web_search` | Real-time web search via DuckDuckGo (no API key) |
| `http_request` | Call any REST API — GET/POST with JSON body |
| `code_runner` | Execute Python code in a sandboxed environment |
| `file_reader` | Read files from a sandboxed workspace |
| `summarize` | Condense and distill long text |

### Node Types
- **Input** — entry point; passes user message into the workflow
- **Agent** — LLM reasoning node with system prompt, temperature, and token controls
- **Tool** — executes built-in or custom tools
- **Knowledge** — RAG retrieval from your local knowledge base
- **Shell Executor** — run bash/Python scripts in a sandboxed `~/agentforge_workspace`
- **File System** — read, write, search files programmatically
- **Output** — synthesizes a final LLM response from all upstream context

### Background Agent Tasks
- Submit long-running agent workflows as **background tasks**
- Full REST API: `POST /agent-tasks`, `GET /agent-tasks`, `GET /agent-tasks/{id}`
- Persistent asyncio task queue — survives across chat sessions
- Poll status — `pending → running → done / failed`

### Chat Preview
- Live chat interface to test your workflow in real-time
- Streams responses token-by-token
- Per-session memory with conversation history

### Knowledge Base (RAG)
- Upload and embed your own documents
- Semantic retrieval injected as context into agent nodes
- Fully local — no external vector database required

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Flow Canvas │  │Chat Preview │  │Debug Console│ │
│  │  (XYFlow)   │  │   (SSE)     │  │   (Logs)    │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘ │
└─────────│────────────────│─────────────────────────-┘
          │  HTTP / SSE    │
┌─────────▼────────────────▼──────────────────────────┐
│                  FastAPI Backend                     │
│  ┌──────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │ Executor │  │Tool Manager │  │Background Agent│  │
│  │(Topo Sort│  │(web_search, │  │(asyncio queue) │  │
│  │         )│  │ code_runner…│  │                │  │
│  └────┬─────┘  └─────────────┘  └────────────────┘  │
│       │                                              │
│  ┌────▼──────────────────────────────────────────┐  │
│  │              LLM Registry                     │  │
│  │  Ollama │ LM Studio │ OpenAI │ Gemini         │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Tech Stack:**
- **Frontend:** React 18, XYFlow (canvas), Vite
- **Backend:** Python 3.13, FastAPI, async/await throughout
- **LLMs:** Ollama, LM Studio, OpenAI API, Google Gemini API
- **Search:** DuckDuckGo Search (no API key required)

---

## Quickstart

### Prerequisites
- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.com/download) installed and running (`ollama pull llama3`)

### 1. Clone the repo
```bash
git clone git@github.com:themaker00001/agentforge.git
cd agentforge
```

### 2. Start the backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Start the frontend
```bash
# From project root
npm install
npm run dev
```

### 4. Open the app
Visit `http://localhost:5173` (or whichever port Vite picks).

---

## Why AgentForge?

How does AgentForge compare to n8n, Flowise, LangFlow, and others?

| Feature | AgentForge | n8n | Flowise | LangFlow |
|---------|-----------|-----|---------|----------|
| 100% local / offline | ✅ | ⚠️ | ✅ | ⚠️ |
| No API key required | ✅ (Ollama/LMStudio) | ❌ | ⚠️ | ❌ |
| Visual flow builder | ✅ | ✅ | ✅ | ✅ |
| Real-time debug console | ✅ | ❌ | ⚠️ | ⚠️ |
| Shell / code execution node | ✅ | ✅ | ❌ | ❌ |
| Background async tasks | ✅ | ✅ | ❌ | ❌ |
| Multi-LLM per node | ✅ | ❌ | ⚠️ | ⚠️ |
| Open source & hackable | ✅ | ✅ (limited) | ✅ | ✅ |
| Cloud lock-in | Never | ⚠️ | ⚠️ | ⚠️ |

### Key Differentiators

**True Privacy** — Every byte stays on your machine. No telemetry, no cloud calls (unless you choose OpenAI/Gemini).

**Per-Node Model Selection** — Use `llama3:8b` for quick tool calls and `gpt-4o` only for final output synthesis. Mix and match freely.

**Code & Shell Execution** — Other visual tools are just prompt chains. AgentForge can actually *run code*, call shell commands, and manipulate files — making real automation possible.

**Background Tasks** — Submit a workflow and walk away. Come back and poll results later — no blocking, no timeouts.

**Developer-First** — The entire backend is clean, readable FastAPI + Python 3.13. No proprietary DSL. Hack it, extend it, own it.

---

## Project Structure

```
agentforge/
├── backend/
│   └── app/
│       ├── llm/              # LLM providers (Ollama, LMStudio, OpenAI, Gemini)
│       ├── models/           # Pydantic schemas (FlowGraph, NodeType, etc.)
│       ├── routes/           # FastAPI routers (flow, execute, chat, tasks…)
│       └── services/
│           ├── executor.py         # Core flow execution engine
│           ├── tool_manager.py     # Built-in tools registry
│           ├── background_agent.py # Async task queue
│           ├── shell_executor.py   # Sandboxed code/shell runner
│           ├── file_agent.py       # File system operations
│           ├── knowledge.py        # RAG / knowledge base
│           └── memory.py           # Session memory
├── src/
│   ├── components/           # React components (Canvas, ChatPreview, DebugConsole…)
│   └── services/             # Frontend API client
└── index.html
```

---

## Roadmap

### Coming Soon
- [ ] Browser Automation node — Playwright integration for web scraping / form filling
- [ ] Voice Input / Whisper — local speech-to-text powered by `faster-whisper`
- [ ] Document Intelligence — PDF/DOCX/Excel parsing and Q&A
- [ ] Workflow Templates — one-click starter workflows (research assistant, code reviewer, email drafter)
- [ ] Agent Memory — persistent long-term memory across sessions (SQLite-backed)
- [ ] Node Marketplace — community-built custom nodes

### Future Vision
- [ ] Multi-agent collaboration — agents that spawn and coordinate sub-agents
- [ ] Plugin SDK — build and share your own tool nodes
- [ ] Mobile companion app — trigger workflows from your phone
- [ ] Local vector DB — ChromaDB / Qdrant integration for large-scale RAG

---

## Contributing

AgentForge is in active development. Contributions, issues, and feature requests are welcome!

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add awesome feature'`
4. Push and open a PR

---

## License

MIT — do whatever you want. Just don't remove the attribution.

---

<div align="center">

Built with care for developers who believe AI should be local, private, and free.

Star this repo if you find it useful!

</div>
