from fastapi import APIRouter
from app.services import graph_memory as gm_svc

router = APIRouter(prefix="/graph-memory", tags=["Knowledge"])

@router.get("/data")
async def get_graph_data():
    """Return all nodes and edges for visualization."""
    return gm_svc.get_graph_data()

@router.delete("/clear")
async def clear_graph():
    """Wipe the graph memory database."""
    gm_svc.clear_db()
    return {"status": "ok", "message": "Graph memory cleared."}
