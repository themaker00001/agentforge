"""
Knowledge Service — in-memory document store with keyword retrieval.
v1: Simple TF-style keyword matching (no external vector DB required).
v2: Swap in ChromaDB / FAISS by implementing the same interface.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Document:
    id:      str
    title:   str
    content: str
    chunks:  list[str] = field(default_factory=list)
    added:   str = field(default_factory=lambda: datetime.utcnow().isoformat())


# Global in-memory store
_store: dict[str, Document] = {}


def _chunk_text(text: str, size: int = 400, overlap: int = 80) -> list[str]:
    """Split text into overlapping character chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += size - overlap
    return chunks


def _score(query: str, chunk: str) -> float:
    """Simple keyword overlap score (0.0–1.0)."""
    q_words = set(re.findall(r"\w+", query.lower()))
    c_words = set(re.findall(r"\w+", chunk.lower()))
    if not q_words:
        return 0.0
    return len(q_words & c_words) / len(q_words)


def add_document(doc_id: str, title: str, content: str) -> Document:
    chunks = _chunk_text(content)
    doc = Document(id=doc_id, title=title, content=content, chunks=chunks)
    _store[doc_id] = doc
    return doc


def list_documents() -> list[dict]:
    return [{"id": d.id, "title": d.title, "chunks": len(d.chunks), "added": d.added}
            for d in _store.values()]


def retrieve(query: str, top_k: int = 3) -> list[str]:
    """Return the top-k most relevant chunks across all documents."""
    scored: list[tuple[float, str]] = []
    for doc in _store.values():
        for chunk in doc.chunks:
            s = _score(query, chunk)
            if s > 0:
                scored.append((s, f"[{doc.title}] {chunk}"))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [text for _, text in scored[:top_k]]


def context_for(query: str, top_k: int = 3) -> str:
    """Return retrieved chunks joined as a context string."""
    chunks = retrieve(query, top_k)
    if not chunks:
        return ""
    return "Knowledge context:\n" + "\n---\n".join(chunks)
