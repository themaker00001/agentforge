"""
Media Processor — converts stored media files into executor-ready strings.

  image → data URL  (data:image/png;base64,...)
  pdf   → extracted plain text
  audio → Whisper transcript (requires openai.audio.transcriptions)
"""

from app.services import media_store


async def process_media(
    file_id: str,
    media_type: str,
    model: str = "",
    api_key: str | None = None,
) -> str:
    """
    Convert a stored media file into a string suitable for downstream nodes.

    Returns:
        - image: data URL string
        - pdf:   plain text extracted from PDF
        - audio: transcript string from Whisper (or placeholder)
    """
    if media_type == "image":
        result = media_store.read_b64(file_id)
        if not result:
            return "[Media file not found]"
        b64, mime = result
        return f"data:{mime};base64,{b64}"

    elif media_type == "pdf":
        return media_store.extract_pdf_text(file_id)

    elif media_type == "audio":
        return await _transcribe_audio(file_id, api_key)

    else:
        result = media_store.read_b64(file_id)
        if not result:
            return "[Media file not found]"
        b64, mime = result
        return f"data:{mime};base64,{b64}"


async def _transcribe_audio(file_id: str, api_key: str | None) -> str:
    """Transcribe audio using OpenAI Whisper API."""
    path = media_store.get_file_path(file_id)
    if not path:
        return "[Audio file not found]"

    if not api_key:
        return (
            f"[Audio transcription requires OpenAI API key. "
            f"Audio file stored at: {path}]"
        )

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        with open(path, "rb") as f:
            transcript = await client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
            )
        return transcript.text
    except Exception as exc:
        return f"[Audio transcription error: {exc}]"
