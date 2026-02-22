"""
Chat route — simplified single-turn chat endpoint.
Runs the active flow with the user's message and streams a clean
response event containing only the final output node's text.
"""

import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services.executor import execute
from app.models.schema import FlowGraph

router = APIRouter()


class ChatRequest(BaseModel):
    message:   str
    flow:      FlowGraph
    model:     str = "ollama:llama3:8b"
    sessionId: str = "default"


def _extract_content(message: str) -> str:
    """Strip executor prefix '  ✓ NodeLabel: ' from an ok message."""
    msg = message.strip()
    if ": " in msg:
        return msg.split(": ", 1)[1].strip("…").strip()
    return msg


def _is_output_node(node_id: str, flow: FlowGraph) -> bool:
    """Return True if the given node has nodeType == 'output'."""
    for node in flow.nodes:
        if node.id == node_id:
            return node.data.nodeType.value == "output"
    return False



@router.post("/chat")
async def chat_route(req: ChatRequest):
    """
    Run the flow with the user message as input.
    Streams SSE log events, then emits a 'response' event with the
    output-node text (or the last agent-node text if no output node exists).
    """
    async def event_stream():
        output_response = ""
        agent_response  = ""

        try:
            async for event in execute(
                graph=req.flow,
                user_input=req.message,
                model=req.model,
                session_id=req.sessionId,
            ):
                yield f"data: {json.dumps(event)}\n\n"

                if event.get("type") == "ok" and event.get("nodeId"):
                    content = (event.get("data") or {}).get("output") or _extract_content(event.get("message", ""))
                    if not content or content == "[DONE]":
                        continue
                    node_id = event["nodeId"]
                    if _is_output_node(node_id, req.flow):
                        output_response = content
                    elif len(content) > 10:
                        agent_response = content

        except Exception as exc:
            err_event = {"type": "err", "message": f"Execution error: {exc}"}
            yield f"data: {json.dumps(err_event)}\n\n"
            yield f"data: {json.dumps({'type': 'response', 'message': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        response_text = output_response or agent_response or "Done."
        yield f"data: {json.dumps({'type': 'response', 'message': response_text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
