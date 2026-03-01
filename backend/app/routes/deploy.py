"""
Deploy routes — save flows as public REST endpoints.
POST /deploy     → saves flow to SQLite
GET  /deploy     → lists deployed APIs
GET  /deploy/{slug} → info (curl snippet)
DEL  /deploy/{slug} → undeploy
POST /api/{slug}    → invoke endpoint (sync JSON)
POST /api/{slug}/stream → invoke endpoint (SSE)
"""

import json
import re
from fastapi import APIRouter, HTTPException, Request, Depends, Header
from fastapi.responses import JSONResponse, StreamingResponse
from app.models.schema import DeployRequest, DeployedAPI, DeployInvokeRequest
from app.services import deploy_store
from app.services.executor import execute

router = APIRouter()

# ── Management Routes ────────────────────────────────────────────────────────

@router.post("/deploy", response_model=DeployedAPI, tags=["Deploy"])
async def create_deploy(req: DeployRequest):
    if not re.match(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$", req.slug):
        raise HTTPException(
            status_code=400,
            detail="Slug must be 3-50 chars, lowercase alphanumeric and hyphens only.",
        )
    
    flow_json = req.flow.model_dump_json()
    record = deploy_store.save_deploy(
        slug=req.slug,
        flow_json=flow_json,
        model=req.model,
        api_key=req.api_key,
    )
    return DeployedAPI(**record)


@router.get("/deploy", response_model=list[DeployedAPI], tags=["Deploy"])
async def list_deploys():
    return [DeployedAPI(**r) for r in deploy_store.list_deploys()]


@router.get("/deploy/{slug}", tags=["Deploy"])
async def get_deploy(slug: str):
    row = deploy_store.get_deploy(slug)
    if not row:
        raise HTTPException(status_code=404, detail="API not found")
    
    has_key = bool(row["api_key_hash"])
    headers = '-H "X-API-Key: YOUR_API_KEY" ' if has_key else ""
    url = f"http://localhost:8000/api/{slug}"
    
    return {
        "slug": row["slug"],
        "model": row["model"],
        "has_api_key": has_key,
        "created_at": row["created_at"],
        "endpoint_url": url,
        "curl_example": f"curl -X POST {url} -H 'Content-Type: application/json' {headers}-d '{{\"input\": \"Hello\"}}'",
    }


@router.delete("/deploy/{slug}", tags=["Deploy"])
async def delete_deploy(slug: str):
    success = deploy_store.delete_deploy(slug)
    if not success:
        raise HTTPException(status_code=404, detail="API not found")
    return {"deleted": slug}


# ── Invoke Routes ────────────────────────────────────────────────────────────

async def _load_and_verify(slug: str, x_api_key: str | None = Header(None)):
    row = deploy_store.get_deploy(slug)
    if not row:
        raise HTTPException(status_code=404, detail="Deployed API not found")
    
    stored_hash = row["api_key_hash"]
    if stored_hash:
        if not x_api_key or not deploy_store.verify_key(x_api_key, stored_hash):
            raise HTTPException(status_code=401, detail="Invalid or missing API key")
            
    from app.models.schema import FlowGraph
    flow = FlowGraph.model_validate_json(row["flow_json"])
    return flow, row["model"]


@router.post("/api/{slug}", tags=["API Invoke"])
async def invoke_api(
    slug: str, 
    req: DeployInvokeRequest, 
    x_api_key: str | None = Header(None)
):
    """Invoke a deployed API synchronously and return the final JSON output."""
    flow, model = await _load_and_verify(slug, x_api_key)
    
    output = ""
    last_ok = ""
    try:
        async for event in execute(
            graph=flow,
            user_input=req.input,
            model=model,
            session_id=slug,
        ):
            if event.get("type") == "ok" and event.get("nodeId"):
                content = (event.get("data") or {}).get("output", "")
                if content and content.strip():
                    last_ok = content
                    for node in flow.nodes:
                        if node.id == event["nodeId"] and node.data.nodeType.value == "output":
                            output = content
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Execution error: {exc}")

    return {
        "output": output or last_ok or "(No output produced)",
        "slug": slug,
        "model": model,
    }


@router.post("/api/{slug}/stream", tags=["API Invoke"])
async def invoke_api_stream(
    slug: str, 
    req: DeployInvokeRequest, 
    x_api_key: str | None = Header(None)
):
    """Invoke a deployed API and stream SSE logs/output."""
    flow, model = await _load_and_verify(slug, x_api_key)
    
    async def event_stream():
        async for log_event in execute(
            graph=flow,
            user_input=req.input,
            model=model,
            session_id=slug,
        ):
            yield f"data: {json.dumps(log_event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
