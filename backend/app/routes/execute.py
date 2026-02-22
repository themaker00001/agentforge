import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models.schema import ExecuteRequest
from app.services.executor import execute

router = APIRouter()


@router.post("/execute")
async def execute_route(req: ExecuteRequest):
    """
    Execute a workflow graph and stream log events via Server-Sent Events.
    Each event is a JSON-encoded LogEvent on a line prefixed with "data: ".
    """
    async def event_stream():
        async for log_event in execute(
            graph=req.flow,
            user_input=req.userInput,
            model=req.model,
            session_id=req.sessionId,
        ):
            yield f"data: {json.dumps(log_event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
