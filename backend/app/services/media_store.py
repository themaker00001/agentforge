"""
Media Store  save uploaded files to /tmp/agentforge_media/ and retrieve them.

Supports: image (PNG, JPEG, GIF, WebP), audio (MP3, WAV, M4A, OGG), PDF.
Returns base64-encoded data for downstream processing.
"""

import base64
import mimetypes
import os
import uuid
from pathlib import Path

_MEDIA_DIR = Path("/tmp/agentforge_media")
_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

# Accepted MIME types  canonical media_type string
MIME_TO_TYPE: dict[str, str] = {
    "image/png":  "image",
    "image/jpeg": "image",
    "image/gif":  "image",
    "image/webp": "image",
    "audio/mpeg": "audio",
    "audio/mp3":  "audio",
    "audio/wav":  "audio",
    "audio/x-wav":"audio",
    "audio/mp4":  "audio",
    "audio/m4a":  "audio",
    "audio/ogg":  "audio",
    "application/pdf": "pdf",
}

EXT_TO_MIME: dict[str, str] = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".webp": "image/webp",
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".m4a":  "audio/mp4",
    ".ogg":  "audio/ogg",
    ".pdf":  "application/pdf",
}


def save_file(filename: str, data: bytes, mime_type: str | None = None) -> dict:
    """
    Save uploaded bytes to disk. Returns file metadata dict:
    { file_id, filename, media_type, mime_type, size_bytes }
    """
    # Detect mime from extension if not provided
    if not mime_type:
        ext = Path(filename).suffix.lower()
        mime_type = EXT_TO_MIME.get(ext, "application/octet-stream")

    media_type = MIME_TO_TYPE.get(mime_type, "unknown")
    file_id = str(uuid.uuid4())
    ext = Path(filename).suffix.lower() or mimetypes.guess_extension(mime_type) or ""
    stored_name = f"{file_id}{ext}"
    dest = _MEDIA_DIR / stored_name
    dest.write_bytes(data)

    return {
        "file_id":    file_id,
        "filename":   filename,
        "stored_name": stored_name,
        "media_type": media_type,
        "mime_type":  mime_type,
        "size_bytes": len(data),
    }


def get_file_path(file_id: str) -> Path | None:
    """Resolve file_id  actual path on disk (searches by prefix)."""
    for f in _MEDIA_DIR.iterdir():
        if f.name.startswith(file_id):
            return f
    return None


def read_b64(file_id: str) -> tuple[str, str] | None:
    """
    Return (base64_data, mime_type) for the given file_id, or None if missing.
    """
    path = get_file_path(file_id)
    if not path:
        return None
    ext = path.suffix.lower()
    mime = EXT_TO_MIME.get(ext, "application/octet-stream")
    b64 = base64.b64encode(path.read_bytes()).decode()
    return b64, mime


def extract_pdf_text(file_id: str) -> str:
    """Extract plain text from a PDF file. Requires pymupdf (fitz)."""
    path = get_file_path(file_id)
    if not path:
        return "[PDF not found]"
    try:
        import fitz  # type: ignore  # pymupdf
        doc = fitz.open(str(path))
        pages = [page.get_text() for page in doc]
        doc.close()
        return "\n\n".join(p.strip() for p in pages if p.strip())
    except ImportError:
        return (
            "[PDF text extraction unavailable  install pymupdf: pip install pymupdf]\n"
            f"PDF file stored at: {path}"
        )
    except Exception as exc:
        return f"[PDF extraction error: {exc}]"
