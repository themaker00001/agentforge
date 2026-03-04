"""
Media Upload Route  POST /media/upload
Accepts a multipart file upload and stores it in /tmp/agentforge_media/.
Returns { file_id, filename, media_type, mime_type, size_bytes }.
"""

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services import media_store

router = APIRouter(prefix="/media", tags=["Media"])


@router.post("/upload")
async def upload_media(file: UploadFile = File(...)):
    """Upload an image, audio, or PDF file for use in a media_input node."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    mime = file.content_type or ""
    meta = media_store.save_file(
        filename=file.filename or "upload",
        data=data,
        mime_type=mime or None,
    )

    if meta["media_type"] == "unknown":
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {mime}. "
                   "Accepted: image (PNG/JPEG/GIF/WebP), audio (MP3/WAV/M4A/OGG), PDF.",
        )

    return meta
