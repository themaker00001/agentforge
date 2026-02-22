"""
Agent Service — runs a single "agent" node using an LLM.
Builds context from memory + knowledge, calls the LLM, stores result.
"""

from app.llm.registry import get_llm
from app.models.schema import Node
from app.services import memory as mem_svc
from app.services import knowledge as know_svc


async def run_agent(
    node: Node,
    user_input: str,
    node_outputs: dict[str, str],
    session_id: str,
    model_override: str | None = None,
    context: str | None = None,
) -> str:
    """Execute an agent node and return its output string."""
    data = node.data
    model_str = model_override or data.model or "ollama:llama3:8b"
    llm = get_llm(model_str)

    # `context` is the direct predecessor outputs passed from the executor.
    # Fall back to all prior outputs, then the raw user input.
    if context is None:
        context = "\n\n".join(node_outputs.values()) or user_input

    # Retrieve knowledge context using the ORIGINAL user question (not context blob)
    knowledge_ctx = know_svc.context_for(user_input, top_k=3) if user_input else ""

    # System prompt
    system_content = data.systemPrompt or (
        f"You are a helpful {data.label} assistant. "
        "Use the provided context to answer the user's question clearly and concisely."
    )
    if knowledge_ctx:
        system_content += f"\n\nRelevant knowledge:\n{knowledge_ctx}"
    if context and context != user_input:
        system_content += f"\n\nContext from previous steps:\n{context}"

    messages: list[dict] = [{"role": "system", "content": system_content}]

    # Inject conversation memory
    if data.memory:
        messages = mem_svc.inject_context(session_id, messages)

    # The actual user message is always the original question
    messages.append({"role": "user", "content": user_input or context})

    # Call LLM
    response = await llm.chat(
        messages,
        temperature=data.temperature,
        max_tokens=data.maxTokens,
    )

    # Store in short-term memory
    if data.memory:
        mem_svc.store_short(session_id, "user",      user_input or context)
        mem_svc.store_short(session_id, "assistant", response)

    return response
