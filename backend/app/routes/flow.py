from fastapi import APIRouter
from app.models.schema import GenerateFlowRequest, FlowGraph
from app.services.planner import generate_flow

router = APIRouter()


@router.post("/generate-flow", response_model=FlowGraph)
async def generate_flow_route(req: GenerateFlowRequest):
    """Convert a user prompt into a structured workflow graph."""
    return await generate_flow(prompt=req.prompt, model=req.model)
