"""
Webhook routes — register a flow for external HTTP triggering.
POST /webhook/register  → stores the flow, returns webhook_id + trigger URL
POST /webhook/{id}      → triggers the flow with HTTP body as user_input
"""

import json
import uuid
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from app.models.schema import WebhookRegisterRequest, FlowGraph
from app.services.executor import execute

router = APIRouter(prefix="/webhook")

# In-memory store: webhook_id → { flow, model, session_id }
_REGISTRY: dict[str, dict] = {}


@router.post("/register")
async def register_webhook(req: WebhookRegisterRequest):
    """
    Register a flow for webhook triggering.
    Returns the webhook_id and a trigger URL.
    """
    wid = str(uuid.uuid4())
    _REGISTRY[wid] = {
        "flow":      req.flow,
        "model":     req.model,
        "sessionId": req.sessionId,
    }
    return {
        "webhook_id":  wid,
        "trigger_url": f"http://localhost:8000/webhook/{wid}",
        "message":     f"Flow registered. POST to /webhook/{wid} with your user_input.",
    }


@router.post("/{webhook_id}")
async def trigger_webhook(webhook_id: str, request: Request):
    """
    Trigger the registered flow.
    Accepts plain text or JSON body with { "user_input": "..." }.
    Returns { "output": "..." }.
    """
    entry = _REGISTRY.get(webhook_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Webhook '{webhook_id}' not found.")

    # Parse body as JSON or plain text
    raw = await request.body()
    try:
        body = json.loads(raw)
        user_input = body.get("user_input") or body.get("message") or str(body)
    except Exception:
        user_input = raw.decode("utf-8", errors="replace").strip()

    flow: FlowGraph = entry["flow"]
    model: str      = entry["model"]
    session_id: str = entry["sessionId"]

    # Run to completion, collect final output
    output = ""
    last_ok = ""
    try:
        async for event in execute(
            graph=flow,
            user_input=user_input,
            model=model,
            session_id=session_id,
        ):
            if event.get("type") == "ok" and event.get("nodeId"):
                content = (event.get("data") or {}).get("output", "")
                if content and content.strip():
                    last_ok = content
                    # Check if this is an output node
                    for node in flow.nodes:
                        if node.id == event["nodeId"] and node.data.nodeType.value == "output":
                            output = content
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Execution error: {exc}")

    return JSONResponse({
        "output": output or last_ok or "(No output produced)",
        "webhook_id": webhook_id,
    })


@router.get("/list")
async def list_webhooks():
    """List all registered webhook IDs."""
    return [
        {"webhook_id": wid, "model": v["model"]}
        for wid, v in _REGISTRY.items()
    ]


@router.delete("/{webhook_id}")
async def delete_webhook(webhook_id: str):
    """Remove a registered webhook."""
    if webhook_id not in _REGISTRY:
        raise HTTPException(status_code=404, detail="Not found.")
    del _REGISTRY[webhook_id]
    return {"deleted": webhook_id}
