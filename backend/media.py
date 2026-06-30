"""
GridFS-backed media storage (Phase 2/3 of the photo-scaling work).

Why: user photos were stored as base64 strings *inside* Mongo documents (up to
5MB each). At scale (1000s of users x 100s of tools) this bloats documents
(risking Mongo's 16MB/doc limit), inflates list payloads, and causes the
out-of-memory crashes on device. This module offloads those base64 blobs into
GridFS (a separate `media` bucket) and replaces the stored value with a small
URL string (`/api/files/{id}`). A downsampled thumbnail is generated per image
and served at `/api/files/{id}/thumb` for fast list rendering.

Design notes:
- TRANSPARENT: callers keep passing/receiving plain strings. On write we call
  `offload_value()` which converts a `data:` URI -> `/api/files/{id}` and leaves
  already-migrated URLs (or empty values) untouched. The frontend's <AppImage>
  resolves relative `/api/...` URLs to the absolute backend URL, so render code
  is unchanged.
- Thumbnails are only generated for images; non-images (e.g. PDF documents) are
  stored full with no thumb.
- GET is unauthenticated by design (ids are unguessable ObjectIds) to keep
  expo-image disk caching simple — same effective exposure as the previous
  inline-base64 approach.
"""

import io
import re
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from PIL import Image

_DATA_URI_RE = re.compile(r"^data:(?P<mime>[\w/.+-]+);base64,(?P<b64>.*)$", re.DOTALL)
_FILE_URL_RE = re.compile(r"^/api/files/(?P<id>[a-fA-F0-9]{24})(?:/thumb)?$")

THUMB_MAX = 256  # px on the longest edge
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf"}

_bucket: Optional[AsyncIOMotorGridFSBucket] = None


def init_media(db) -> None:
    """Initialise the GridFS bucket against the app's real database."""
    global _bucket
    _bucket = AsyncIOMotorGridFSBucket(db, bucket_name="media")


def _require_bucket() -> AsyncIOMotorGridFSBucket:
    if _bucket is None:
        raise RuntimeError("media bucket not initialised — call init_media(db) at startup")
    return _bucket


def is_data_uri(value: Optional[str]) -> bool:
    return bool(value) and isinstance(value, str) and value.startswith("data:")


def _make_thumbnail(raw: bytes) -> Optional[bytes]:
    """Return JPEG thumbnail bytes (<=THUMB_MAX px), or None if not an image."""
    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        img.thumbnail((THUMB_MAX, THUMB_MAX))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return buf.getvalue()
    except Exception:
        return None


async def offload_value(owner_id: str, value: Optional[str]) -> Optional[str]:
    """Convert a `data:` URI to a `/api/files/{id}` URL (storing it in GridFS).

    Pass-through for empty values and already-migrated URLs.
    """
    if not is_data_uri(value):
        return value
    m = _DATA_URI_RE.match(value)
    if not m:
        return value
    mime = m.group("mime").lower()
    try:
        import base64
        raw = base64.b64decode(m.group("b64"), validate=False)
    except Exception:
        return value
    bucket = _require_bucket()
    ext = _EXT.get(mime, "bin")

    # Thumbnail first (so we can link it from the full file's metadata).
    thumb_id = None
    if mime.startswith("image/"):
        thumb_bytes = _make_thumbnail(raw)
        if thumb_bytes:
            thumb_id = await bucket.upload_from_stream(
                f"{owner_id}_thumb.jpg",
                thumb_bytes,
                metadata={"owner_id": owner_id, "content_type": "image/jpeg", "kind": "thumb"},
            )

    full_id = await bucket.upload_from_stream(
        f"{owner_id}_full.{ext}",
        raw,
        metadata={
            "owner_id": owner_id,
            "content_type": mime,
            "kind": "full",
            "thumb_id": thumb_id,
        },
    )
    return f"/api/files/{full_id}"


async def offload_list(owner_id: str, values: Optional[List[str]]) -> Optional[List[str]]:
    if values is None:
        return None
    out: List[str] = []
    for v in values:
        out.append(await offload_value(owner_id, v))
    return out


def thumb_url(value: Optional[str]) -> Optional[str]:
    """Map a stored `/api/files/{id}` URL to its thumbnail URL for list views."""
    if not value or not isinstance(value, str):
        return value
    m = _FILE_URL_RE.match(value)
    if not m:
        return value  # legacy base64 or external URL — leave as-is
    return f"/api/files/{m.group('id')}/thumb"


async def read_full_bytes(value: Optional[str]):
    """Return (raw_bytes, content_type) for a `/api/files/{id}` URL (or bare
    24-hex id), reading the FULL-resolution file from GridFS. (None, None) if
    the value isn't a GridFS reference or can't be read."""
    if not value or not isinstance(value, str):
        return None, None
    m = _FILE_URL_RE.match(value)
    if m:
        fid = m.group("id")
    elif re.fullmatch(r"[a-fA-F0-9]{24}", value):
        fid = value
    else:
        return None, None
    bucket = _require_bucket()
    try:
        grid_out = await bucket.open_download_stream(ObjectId(fid))
        ct = (grid_out.metadata or {}).get("content_type") or "image/jpeg"
        chunks = []
        while True:
            c = await grid_out.readchunk()
            if not c:
                break
            chunks.append(c)
        return b"".join(chunks), ct
    except Exception:
        return None, None


async def to_data_uri(value: Optional[str]) -> Optional[str]:
    """Resolve a `/api/files/{id}` reference to a base64 `data:` URI. Pass other
    values (already-data-URI, empty, external) through unchanged."""
    raw, ct = await read_full_bytes(value)
    if raw is None:
        return value
    import base64
    return f"data:{ct};base64,{base64.b64encode(raw).decode()}"


async def resolve_media(obj):
    """Recursively walk a dict/list/str structure and replace every stored
    `/api/files/{id}` media reference with an inline base64 `data:` URI.

    Used by the PDF report engines, which embed images synchronously and only
    understand base64 — without this, GridFS-backed photos render blank or
    corrupt. Mutates dicts in place and returns the (possibly new) object."""
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            obj[k] = await resolve_media(v)
        return obj
    if isinstance(obj, list):
        return [await resolve_media(v) for v in obj]
    if isinstance(obj, str) and _FILE_URL_RE.match(obj):
        return await to_data_uri(obj)
    return obj


async def delete_value(value: Optional[str]) -> None:
    """Best-effort delete of a stored media URL's full + thumbnail files."""
    if not value or not isinstance(value, str):
        return
    m = _FILE_URL_RE.match(value)
    if not m:
        return
    bucket = _require_bucket()
    try:
        oid = ObjectId(m.group("id"))
        full = await bucket.open_download_stream(oid)
        thumb_id = (full.metadata or {}).get("thumb_id")
        await bucket.delete(oid)
        if thumb_id:
            try:
                await bucket.delete(ObjectId(thumb_id) if not isinstance(thumb_id, ObjectId) else thumb_id)
            except Exception:
                pass
    except Exception:
        pass


async def delete_values(values) -> None:
    if not values:
        return
    if isinstance(values, str):
        await delete_value(values)
        return
    for v in values:
        await delete_value(v)


# ------------------------- Router -------------------------
router = APIRouter()


async def _stream(oid: ObjectId) -> StreamingResponse:
    bucket = _require_bucket()
    try:
        grid_out = await bucket.open_download_stream(oid)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    content_type = (grid_out.metadata or {}).get("content_type") or "application/octet-stream"

    async def it():
        while True:
            chunk = await grid_out.readchunk()
            if not chunk:
                break
            yield chunk

    return StreamingResponse(
        it(),
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": str(oid),
        },
    )


@router.get("/files/{file_id}/thumb")
async def get_thumb(file_id: str):
    bucket = _require_bucket()
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file id")
    try:
        grid_out = await bucket.open_download_stream(oid)
        thumb_id = (grid_out.metadata or {}).get("thumb_id")
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    if thumb_id:
        return await _stream(ObjectId(thumb_id) if not isinstance(thumb_id, ObjectId) else thumb_id)
    # No thumbnail (e.g. non-image) — fall back to the full file.
    return await _stream(oid)


@router.get("/files/{file_id}")
async def get_file(file_id: str):
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file id")
    return await _stream(oid)
