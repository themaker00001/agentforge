from fastapi import APIRouter
from app.models.schema import ModelsResponse
from app.llm.registry import get_all_models

router = APIRouter()


@router.get("/models", response_model=ModelsResponse)
async def get_models():
    """Return available models from all configured providers."""
    return await get_all_models()
