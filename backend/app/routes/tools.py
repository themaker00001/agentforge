from fastapi import APIRouter, UploadFile, File, HTTPException
from app.models.schema import ToolExecuteRequest, CustomToolDefinition
from app.services.tool_manager import (
    run_tool,
    list_tools,
    get_tool_catalog,
    list_custom_tools,
    upsert_custom_tool,
    delete_custom_tool,
    SANDBOX_DIR,
)

router = APIRouter()


@router.post("/tool/execute")
async def execute_tool(req: ToolExecuteRequest):
    """Directly invoke a tool by name with params."""
    result = await run_tool(req.tool, req.params)
    return {"tool": req.tool, "result": result}


@router.get("/tools")
async def get_tools():
    """List available built-in tools with metadata for UX/planning."""
    return {"tools": list_tools(), "catalog": get_tool_catalog()}


@router.get("/tools/custom")
async def get_custom_tools():
    """List user-defined custom tool adapters."""
    return {"tools": list_custom_tools()}


@router.post("/tools/custom")
async def create_or_update_custom_tool(req: CustomToolDefinition):
    """Create/update a custom tool adapter (HTTP or script)."""
    try:
        record = upsert_custom_tool(req.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"tool": record, "message": "Custom tool saved"}


@router.delete("/tools/custom/{tool_name}")
async def remove_custom_tool(tool_name: str):
    """Delete a custom tool adapter."""
    if not delete_custom_tool(tool_name):
        raise HTTPException(status_code=404, detail="Custom tool not found")
    return {"deleted": tool_name}


@router.post("/tool/upload")
async def upload_tool_file(file: UploadFile = File(...)):
    """Upload a file directly to the tool sandbox directory."""
    target_path = SANDBOX_DIR / file.filename
    content = await file.read()
    target_path.write_bytes(content)
    return {"filename": file.filename, "message": "File uploaded successfully to sandbox"}
