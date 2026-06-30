"""Local filesystem storage for document uploads."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

API_DIR = os.path.dirname(os.path.dirname(__file__))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(API_DIR, "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".docx", ".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls"}
MAX_FILE_BYTES = 25 * 1024 * 1024


class StorageError(Exception):
    pass


def is_configured() -> bool:
    return True


def get_mode() -> str:
    return "local"


def _sanitize_segment(value: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]', "-", value.strip())
    return cleaned or "unknown"


def build_folder(entity_type: str, entity_id: str, doc_type: str) -> str:
    return os.path.join(
        UPLOAD_DIR,
        _sanitize_segment(entity_type),
        _sanitize_segment(entity_id),
        _sanitize_segment(doc_type),
    )


def upload_bytes(
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
    file_name: str,
    content: bytes,
) -> dict[str, Any]:
    if len(content) > MAX_FILE_BYTES:
        raise StorageError(f"Ukuran file melebihi {MAX_FILE_BYTES // (1024 * 1024)} MB")

    ext = os.path.splitext(file_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise StorageError(
            f"Format tidak didukung. Gunakan: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    safe_name = _sanitize_segment(os.path.splitext(file_name)[0]) + ext
    folder = build_folder(entity_type, entity_id, doc_type)
    os.makedirs(folder, exist_ok=True)

    file_path = os.path.join(folder, safe_name)
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info("File disimpan: %s (%d bytes)", file_path, len(content))
    rel_path = os.path.relpath(file_path, UPLOAD_DIR).replace("\\", "/")

    return {
        "storage_path": rel_path,
        "file_name": safe_name,
    }


def get_file_path(storage_path: str) -> str:
    real_upload = os.path.normcase(os.path.realpath(UPLOAD_DIR))

    if not os.path.isabs(storage_path):
        resolved = os.path.join(UPLOAD_DIR, storage_path)
    else:
        resolved = storage_path

    real_resolved = os.path.realpath(resolved)
    if os.path.normcase(real_resolved).startswith(real_upload + os.sep):
        if os.path.isfile(real_resolved):
            return real_resolved

    if os.path.isabs(storage_path):
        real_orig = os.path.realpath(storage_path)
        if os.path.isfile(real_orig):
            return real_orig

    raise StorageError("File tidak ditemukan")


def delete_file(storage_path: str) -> None:
    try:
        real_path = get_file_path(storage_path)
        os.remove(real_path)
        logger.info("File dihapus: %s", real_path)
    except StorageError:
        raise
    except Exception as exc:
        logger.error("Gagal menghapus file: %s", exc)
        raise StorageError("Gagal menghapus file") from exc