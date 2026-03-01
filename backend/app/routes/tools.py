from fastapi import APIRouter, UploadFile, File
from app.models.schema import ToolExecuteRequest
from app.services.tool_manager import run_tool, list_tools, SANDBOX_DIR

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


@router.post("/tool/upload")
async def upload_tool_file(file: UploadFile = File(...)):
    """Upload a file directly to the tool sandbox directory."""
    target_path = SANDBOX_DIR / file.filename
    content = await file.read()
    target_path.write_bytes(content)
    return {"filename": file.filename, "message": "File uploaded successfully to sandbox"}
