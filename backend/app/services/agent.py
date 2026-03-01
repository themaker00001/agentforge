"""
Agent Service — runs a single "agent" node using an LLM.
Builds context from memory + knowledge, calls the LLM, stores result.
"""

from app.llm.registry import get_llm
from app.models.schema import Node
from app.services import memory as mem_svc
from app.services import knowledge as know_svc


def _build_messages(node: Node, user_input: str, node_outputs: dict, session_id: str,
                    context: str | None, model_override: str | None) -> tuple[list[dict], object]:
    """Build the message list and llm instance shared by run_agent and run_agent_stream."""
    data = node.data
    model_str = model_override or data.model or "ollama:llama3:8b"
    llm = get_llm(model_str, api_key=data.apiKey)

    if context is None:
        context = "\n\n".join(node_outputs.values()) or user_input

    knowledge_ctx = know_svc.context_for(user_input, top_k=3) if user_input else ""

    system_content = data.systemPrompt or (
        f"You are a helpful {data.label} assistant. "
        "Use the provided context to answer the user's question clearly and concisely."
    )
    if knowledge_ctx:
        system_content += f"\n\nRelevant knowledge:\n{knowledge_ctx}"
    if context and context != user_input:
        system_content += f"\n\nContext from previous steps:\n{context}"

    messages: list[dict] = [{"role": "system", "content": system_content}]

    if data.memory:
        messages = mem_svc.inject_context(session_id, messages)

    messages.append({"role": "user", "content": user_input or context})

    return messages, llm


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
    messages, llm = _build_messages(node, user_input, node_outputs, session_id, context, model_override)

    response = await llm.chat(
        messages,
        temperature=data.temperature,
        max_tokens=data.maxTokens,
    )

    if data.memory:
        mem_svc.store_short(session_id, "user",      user_input or context)
        mem_svc.store_short(session_id, "assistant", response)

    return response


async def run_agent_stream(
    node: Node,
    user_input: str,
    node_outputs: dict[str, str],
    session_id: str,
    model_override: str | None = None,
    context: str | None = None,
):
    """
    Async generator that streams text chunks from the LLM.
    Yields str chunks. Stores the full response in memory when done.
    """
    data = node.data
    messages, llm = _build_messages(node, user_input, node_outputs, session_id, context, model_override)

    full_response = []
    async for chunk in llm.chat_stream(
        messages,
        temperature=data.temperature,
        max_tokens=data.maxTokens,
    ):
        full_response.append(chunk)
        yield chunk

    response = "".join(full_response)
    if data.memory:
        mem_svc.store_short(session_id, "user",      user_input or context or "")
        mem_svc.store_short(session_id, "assistant", response)
