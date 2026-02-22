import uuid
from fastapi import APIRouter, UploadFile, File
from app.models.schema import KnowledgeUploadRequest
from app.services import knowledge as know_svc

router = APIRouter()


@router.post("/knowledge/upload")
async def upload_knowledge(req: KnowledgeUploadRequest):
    """Add a text document to the in-memory knowledge store."""
    doc_id = str(uuid.uuid4())[:8]
    doc = know_svc.add_document(doc_id, req.title or "Untitled", req.text or "")
    return {"id": doc.id, "title": doc.title, "chunks": len(doc.chunks)}


@router.post("/knowledge/upload-file")
async def upload_knowledge_file(file: UploadFile = File(...)):
    """Upload a text file to the knowledge store."""
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    doc_id = str(uuid.uuid4())[:8]
    doc = know_svc.add_document(doc_id, file.filename or "Uploaded", text)
    return {"id": doc.id, "title": doc.title, "chunks": len(doc.chunks)}


@router.get("/knowledge")
async def list_knowledge():
    return {"documents": know_svc.list_documents()}


@router.post("/knowledge/retrieve")
async def retrieve_knowledge(query: str, top_k: int = 3):
    return {"results": know_svc.retrieve(query, top_k)}
