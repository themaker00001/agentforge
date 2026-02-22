from fastapi import APIRouter
from app.models.schema import ToolExecuteRequest
from app.services.tool_manager import run_tool, list_tools

router = APIRouter()


@router.post("/tool/execute")
async def execute_tool(req: ToolExecuteRequest):
    """Directly invoke a tool by name with params."""
    result = await run_tool(req.tool, req.params)
    return {"tool": req.tool, "result": result}


@router.get("/tools")
async def get_tools():
    """List all available built-in tools."""
    return {"tools": list_tools()}
